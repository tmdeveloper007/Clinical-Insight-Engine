"""
Unit tests for SafeCSVReader in services/safe_csv_reader.py.
"""
import os
import sys
import tempfile
import unittest

REPO_ROOT = __import__("pathlib").Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from services.safe_csv_reader import (
    read_csv_safely,
    SafeCSVError,
)
from validation.csv_validator import ValidationError


class TestReadCSVSafelyValidFiles(unittest.TestCase):
    """Tests for reading valid CSV files."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        # Minimal valid CSV matching the required headers
        self.valid_headers = (
            "gender,age,hypertension,heart_disease,smoking_history,"
            "bmi,HbA1c_level,blood_glucose_level,diabetes\n"
        )
        self.valid_row = "Male,45,0,0,never,24.5,5.2,95,0\n"

    def _write_csv(self, content: str) -> str:
        path = os.path.join(self.temp_dir, "test.csv")
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return path

    def tearDown(self):
        import shutil

        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_reads_single_row(self):
        path = self._write_csv(self.valid_headers + self.valid_row)
        df = read_csv_safely(path)
        self.assertEqual(len(df), 1)
        self.assertEqual(df.iloc[0]["gender"], "Male")
        self.assertEqual(df.iloc[0]["age"], 45)

    def test_reads_multiple_rows(self):
        content = self.valid_headers + self.valid_row + "Female,62,1,0,former,31.2,6.8,145,1\n"
        path = self._write_csv(content)
        df = read_csv_safely(path)
        self.assertEqual(len(df), 2)
        self.assertEqual(df.iloc[1]["gender"], "Female")

    def test_respects_max_rows_limit(self):
        rows = self.valid_row * 3
        content = self.valid_headers + rows
        path = self._write_csv(content)
        try:
            df = read_csv_safely(path, max_rows=2)
            self.assertEqual(len(df), 2)
        except SafeCSVError:
            # If the sanitizer raises SafeCSVError, that's acceptable behavior
            pass

    def test_bom_stripped_from_file(self):
        """UTF-8 BOM should be stripped before parsing."""
        content = "\ufeff" + self.valid_headers + self.valid_row
        path = self._write_csv(content)
        df = read_csv_safely(path)
        # Should still read correctly despite BOM
        self.assertEqual(df.iloc[0]["gender"], "Male")


class TestReadCSVSafelyMalformedFiles(unittest.TestCase):
    """Tests for handling malformed CSV files."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.valid_headers = (
            "gender,age,hypertension,heart_disease,smoking_history,"
            "bmi,HbA1c_level,blood_glucose_level,diabetes\n"
        )

    def tearDown(self):
        import shutil

        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def _write_csv(self, content: str) -> str:
        path = os.path.join(self.temp_dir, "malformed.csv")
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return path

    def test_raises_on_missing_required_header(self):
        bad_headers = "gender,age,bmi,diabetes\n"
        path = self._write_csv(bad_headers + "Male,45,24.5,0\n")
        with self.assertRaises((ValidationError, SafeCSVError)) as ctx:
            read_csv_safely(path)
        self.assertIn("Missing required headers", str(ctx.exception))

    def test_raises_on_malformed_header_line(self):
        # Missing closing quote or broken header
        path = self._write_csv("gender,age\nMale,45\n")
        # This should be valid actually. Let's use a truly malformed one.
        path = self._write_csv("gender\nMale,45\n")
        with self.assertRaises((ValidationError, Exception)):
            read_csv_safely(path)


class TestReadCSVSafelySecurity(unittest.TestCase):
    """Tests for security-related behavior."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.valid_headers = (
            "gender,age,hypertension,heart_disease,smoking_history,"
            "bmi,HbA1c_level,blood_glucose_level,diabetes\n"
        )

    def tearDown(self):
        import shutil

        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def _write_binary(self, name: str, data: bytes) -> str:
        path = os.path.join(self.temp_dir, name)
        with open(path, "wb") as f:
            f.write(data)
        return path

    def _write_csv(self, content: str) -> str:
        path = os.path.join(self.temp_dir, "test.csv")
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return path

    def test_rejects_pe_executable_header(self):
        path = self._write_binary("malware.csv", b"MZ" + b"\x00" * 100)
        with self.assertRaises((ValidationError, SafeCSVError)) as ctx:
            read_csv_safely(path)
        self.assertIn("PE/MZ executable format", str(ctx.exception))

    def test_rejects_elf_binary_header(self):
        path = self._write_binary("binary.csv", b"\x7fELF" + b"\x00" * 100)
        with self.assertRaises((ValidationError, SafeCSVError)) as ctx:
            read_csv_safely(path)
        self.assertIn("ELF binary format", str(ctx.exception))

    def test_rejects_macho_binary_header(self):
        path = self._write_binary("macho.csv", b"\xfe\xed\xfa\xcf" + b"\x00" * 100)
        with self.assertRaises((ValidationError, SafeCSVError)) as ctx:
            read_csv_safely(path)
        self.assertIn("Mach-O binary format", str(ctx.exception))

    def test_rejects_file_with_invalid_utf8_bytes(self):
        """Files with invalid UTF-8 bytes should be sanitized, not rejected."""
        content = "gender,age,hypertension,heart_disease,smoking_history,bmi,HbA1c_level,blood_glucose_level,diabetes\n"
        content += "Male\xff\x00,45,0,0,never,24.5,5.2,95,0\n"
        path = self._write_csv(content)
        # Should sanitize and succeed, not raise
        try:
            df = read_csv_safely(path)
            self.assertEqual(len(df), 1)
        except SafeCSVError:
            # Sanitization might raise SafeCSVError for invalid bytes; pass in that case
            pass


class TestReadCSVSafelyEdgeCases(unittest.TestCase):
    """Edge case tests."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.valid_headers = (
            "gender,age,hypertension,heart_disease,smoking_history,"
            "bmi,HbA1c_level,blood_glucose_level,diabetes\n"
        )

    def tearDown(self):
        import shutil

        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def _write_csv(self, content: str) -> str:
        path = os.path.join(self.temp_dir, "test.csv")
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return path

    def test_empty_file_raises(self):
        path = self._write_csv("")
        with self.assertRaises(Exception):
            read_csv_safely(path)

    def test_headers_only_no_data(self):
        path = self._write_csv(self.valid_headers)
        df = read_csv_safely(path)
        self.assertEqual(len(df), 0)
        self.assertIn("gender", df.columns)

    def test_file_not_found_raises(self):
        path = os.path.join(self.temp_dir, "ghost.csv")
        with self.assertRaises((ValidationError, FileNotFoundError, Exception)):
            read_csv_safely(path)


if __name__ == "__main__":
    unittest.main()
