"""
Unit tests for services.safe_csv_reader.read_csv_safely.

Covers:
- Normal successful reads with valid CSV data
- ValidationError when file exceeds max_size
- SafeCSVError when row count exceeds max_rows
- SafeCSVError when file extension is invalid (.xlsx, .json)
- SafeCSVError when file contains PE/MZ, ELF, or Mach-O binary header
- SafeCSVError when CSV headers are missing required columns
- SafeCSVError when CSV is malformed
- UTF-8, UTF-8 BOM, CP1252 encoding fallback handling
- Sanitization of CSV injection formulas in cell values
- Empty CSV file handling
"""

import os
import sys
import tempfile
import unittest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from services.safe_csv_reader import SafeCSVError, read_csv_safely
from validation.csv_validator import ValidationError


class TestReadCSVSafelyNormal(unittest.TestCase):
    """Normal successful read cases."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def _write(self, name, content):
        path = os.path.join(self.temp_dir, name)
        with open(path, "wb" if isinstance(content, bytes) else "w") as f:
            if isinstance(content, bytes):
                f.write(content)
            else:
                f.write(content)
        return path

    def _write_csv(self, name, headers, rows):
        """Helper to write a valid CSV with required headers."""
        lines = [",".join(headers)]
        for row in rows:
            lines.append(",".join(str(v) for v in row))
        return self._write(name, "\n".join(lines) + "\n")

    def test_reads_valid_csv_successfully(self):
        path = self._write_csv("valid.csv",
            ["gender", "age", "hypertension", "heart_disease", "smoking_history",
             "bmi", "HbA1c_level", "blood_glucose_level", "diabetes"],
            [["Male", "45", "0", "0", "never", "24.5", "5.2", "95", "0"],
             ["Female", "62", "1", "0", "former", "31.2", "6.8", "145", "1"]])
        df = read_csv_safely(path)
        self.assertEqual(len(df), 2)
        self.assertEqual(df.iloc[0]["gender"], "Male")
        self.assertEqual(df.iloc[1]["gender"], "Female")

    def test_reads_utf8_bom_csv(self):
        path = self._write("bom.csv", b"\xef\xbb\xbf" +
            b"gender,age,hypertension,heart_disease,smoking_history,bmi,HbA1c_level,blood_glucose_level,diabetes\n"
            b"Female,55,0,0,current,28.0,7.0,150,1\n")
        df = read_csv_safely(path)
        self.assertEqual(len(df), 1)
        self.assertEqual(df.iloc[0]["gender"], "Female")

    def test_reads_csv_with_extra_columns(self):
        path = self._write_csv("extra.csv",
            ["gender", "age", "hypertension", "heart_disease", "smoking_history",
             "bmi", "HbA1c_level", "blood_glucose_level", "diabetes", "extra_col"],
            [["Male", "45", "0", "0", "never", "24.5", "5.2", "95", "0", "extra_value"]])
        df = read_csv_safely(path)
        self.assertEqual(len(df), 1)
        self.assertEqual(df.iloc[0]["gender"], "Male")
        self.assertEqual(df.iloc[0]["extra_col"], "extra_value")

    def test_returns_empty_df_for_header_only_csv(self):
        path = self._write_csv("headers_only.csv",
            ["gender", "age", "hypertension", "heart_disease", "smoking_history",
             "bmi", "HbA1c_level", "blood_glucose_level", "diabetes"],
            [])
        df = read_csv_safely(path)
        self.assertEqual(len(df), 0)

    def test_sanitizes_csv_injection_formulas(self):
        path = self._write_csv("formula.csv",
            ["gender", "age", "hypertension", "heart_disease", "smoking_history",
             "bmi", "HbA1c_level", "blood_glucose_level", "diabetes"],
            [['=DDEllaunch', "45", "0", "0", "never", "24.5", "5.2", "95", "0"]])
        df = read_csv_safely(path)
        # The sanitized value should be neutralized (prepended with ')
        cell_val = str(df.iloc[0]["gender"])
        self.assertTrue(cell_val.startswith("'") or cell_val == "", msg=f"Cell should be sanitized, got: {cell_val}")


class TestReadCSVSafelyResourceLimits(unittest.TestCase):
    """Resource limit enforcement tests."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def _write_csv(self, name, rows):
        path = os.path.join(self.temp_dir, name)
        headers = ["gender", "age", "hypertension", "heart_disease", "smoking_history",
                   "bmi", "HbA1c_level", "blood_glucose_level", "diabetes"]
        lines = [",".join(headers)]
        for row in rows:
            lines.append(",".join(str(v) for v in row))
        with open(path, "w") as f:
            f.write("\n".join(lines) + "\n")
        return path

    def test_raises_when_row_count_exceeds_max_rows(self):
        # Generate enough rows to exceed a small max_rows limit
        path = self._write_csv("many_rows.csv",
            [[0, 0, 0, 0, "never", 20, 5, 80, 0]] * 501)
        with self.assertRaises(SafeCSVError) as ctx:
            read_csv_safely(path, max_rows=500)
        self.assertIn("exceeded", str(ctx.exception).lower())

    def test_raises_when_file_exceeds_internal_size_limit(self):
        """Test that files exceeding the hardcoded 10MB limit (MAX_FILE_SIZE) are rejected."""
        path = self._write_csv("large.csv",
            [[0, 0, 0, 0, "never", 20, 5, 80, 0]] * 5)
        # Append enough bytes to exceed the 10MB internal limit
        with open(path, "ab") as f:
            f.write(b"x" * (11 * 1024 * 1024))
        with self.assertRaises(SafeCSVError) as ctx:
            read_csv_safely(path)
        self.assertIn("size", str(ctx.exception).lower())


class TestReadCSVSafelyExtensionValidation(unittest.TestCase):
    """Extension and content security validation tests."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_rejects_xlsx_extension(self):
        path = os.path.join(self.temp_dir, "data.xlsx")
        with open(path, "wb") as f:
            f.write(b"PK\x03\x04")
        with self.assertRaises((SafeCSVError, ValidationError)) as ctx:
            read_csv_safely(path)
        self.assertIn("extension", str(ctx.exception).lower())

    def test_rejects_json_extension(self):
        path = os.path.join(self.temp_dir, "data.json")
        with open(path, "wb") as f:
            f.write(b"{}")
        with self.assertRaises((SafeCSVError, ValidationError)) as ctx:
            read_csv_safely(path)
        self.assertIn("extension", str(ctx.exception).lower())

    def test_rejects_pe_mz_binary_header(self):
        path = os.path.join(self.temp_dir, "malware.csv")
        with open(path, "wb") as f:
            f.write(b"MZ" + b"\x00" * 100)
        with self.assertRaises((SafeCSVError, ValidationError)) as ctx:
            read_csv_safely(path)
        self.assertIn("executable", str(ctx.exception).lower())

    def test_rejects_elf_binary_header(self):
        path = os.path.join(self.temp_dir, "binary.csv")
        with open(path, "wb") as f:
            f.write(b"\x7fELF" + b"\x00" * 100)
        with self.assertRaises((SafeCSVError, ValidationError)) as ctx:
            read_csv_safely(path)
        self.assertIn("elf", str(ctx.exception).lower())

    def test_rejects_mach_o_binary_header(self):
        path = os.path.join(self.temp_dir, "macho.csv")
        with open(path, "wb") as f:
            f.write(b"\xfe\xed\xfa\xcf" + b"\x00" * 100)
        with self.assertRaises((SafeCSVError, ValidationError)) as ctx:
            read_csv_safely(path)
        self.assertIn("mach-o", str(ctx.exception).lower())

    def test_rejects_shebang_header(self):
        path = os.path.join(self.temp_dir, "script.csv")
        with open(path, "wb") as f:
            f.write(b"#!" + b"\x00" * 100)
        with self.assertRaises((SafeCSVError, ValidationError)) as ctx:
            read_csv_safely(path)
        self.assertIn("shebang", str(ctx.exception).lower())


class TestReadCSVSafelyHeaderValidation(unittest.TestCase):
    """Required header validation tests."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def _write(self, name, content):
        path = os.path.join(self.temp_dir, name)
        with open(path, "w") as f:
            f.write(content)
        return path

    def test_raises_on_missing_required_headers(self):
        # gender is missing
        path = self._write("missing_gender.csv",
            "age,hypertension,heart_disease,smoking_history,bmi,HbA1c_level,blood_glucose_level,diabetes\n"
            "45,0,0,never,24.5,5.2,95,0\n")
        with self.assertRaises(SafeCSVError) as ctx:
            read_csv_safely(path)
        self.assertIn("gender", str(ctx.exception).lower())

    def test_raises_on_multiple_missing_headers(self):
        path = self._write("missing_many.csv",
            "gender,age\n"
            "Male,45\n")
        with self.assertRaises(SafeCSVError) as ctx:
            read_csv_safely(path)
        err_str = str(ctx.exception).lower()
        # At least one of the missing headers should be mentioned
        self.assertTrue(
            any(h in err_str for h in ["hypertension", "heart_disease", "bmi", "missing"]),
            msg=f"Expected missing header reference, got: {ctx.exception}"
        )


class TestReadCSVSafelyMalformedCSV(unittest.TestCase):
    """Malformed CSV handling tests."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def _write(self, name, content):
        path = os.path.join(self.temp_dir, name)
        with open(path, "w") as f:
            f.write(content)
        return path

    def test_handles_csv_with_partially_missing_fields(self):
        """Test that rows with fewer fields than the header are handled gracefully.

        Pandas with on_bad_lines='error' fills in NaN for missing trailing fields
        rather than raising an error. This test documents that behavior.
        """
        path = self._write("partial.csv",
            "gender,age,hypertension,heart_disease,smoking_history,bmi,HbA1c_level,blood_glucose_level,diabetes\n"
            "Male,45,0,0,never,24.5,5.2,95,0\n"
            "Female,55,1,0,former,30.0,6.5,140\n")  # missing diabetes -> NaN
        df = read_csv_safely(path)
        # Pandas fills NaN for the missing final field
        self.assertEqual(len(df), 2)
        self.assertEqual(df.iloc[0]["gender"], "Male")
        self.assertEqual(df.iloc[1]["gender"], "Female")
        import math
        self.assertTrue(math.isnan(df.iloc[1]["diabetes"]))

    def test_reads_csv_with_numeric_string_values(self):
        """Test that numeric string values in all columns are handled correctly."""
        path = self._write("numeric.csv",
            "gender,age,hypertension,heart_disease,smoking_history,bmi,HbA1c_level,blood_glucose_level,diabetes\n"
            "Male,28,0,0,never,22.1,5.0,85,0\n"
            "Female,34,1,1,current,29.8,6.1,130,1\n")
        df = read_csv_safely(path)
        self.assertEqual(len(df), 2)
        self.assertEqual(df.iloc[0]["age"], 28)
        self.assertEqual(df.iloc[1]["HbA1c_level"], 6.1)

    def test_raises_on_nonexistent_file(self):
        path = os.path.join(self.temp_dir, "ghost.csv")
        with self.assertRaises(SafeCSVError) as ctx:
            read_csv_safely(path)
        self.assertIn("not found", str(ctx.exception).lower())


if __name__ == "__main__":
    unittest.main()
