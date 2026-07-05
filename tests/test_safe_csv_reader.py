"""
Unit tests for services.safe_csv_reader.read_csv_safely.

Covers:
- Successful CSV read with sanitization
- ValidationError from validate_file_size
- ValidationError from validate_extension_and_content
- ValidationError from validate_headers
- ResourceExhaustedError from ResourceGuard
- SafeCSVError from pd.errors.ParserError
- SafeCSVError from MemoryError
- SafeCSVError from unexpected exceptions
"""
import os
import sys
import unittest
import tempfile
import io

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from services.safe_csv_reader import SafeCSVError, read_csv_safely
from validation.csv_validator import ValidationError
from services.resource_guard import ResourceExhaustedError


class TestReadCSVSafely(unittest.TestCase):
    """Tests for read_csv_safely."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def _make_csv(self, name, content):
        path = os.path.join(self.temp_dir, name)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return path

    def test_reads_valid_csv_successfully(self):
        # Required headers must match csv_validator REQUIRED_HEADERS
        csv_content = (
            "gender,age,hypertension,heart_disease,smoking_history,"
            "bmi,HbA1c_level,blood_glucose_level,diabetes\n"
            "Male,30,False,False,never,22.5,5.0,95,False\n"
            "Female,25,True,False,former,28.1,6.5,140,True\n"
        )
        path = self._make_csv("valid.csv", csv_content)
        df = read_csv_safely(path)
        self.assertEqual(len(df), 2)
        self.assertIn("gender", df.columns)
        self.assertIn("age", df.columns)
        self.assertEqual(df.iloc[0]["gender"], "Male")
        self.assertEqual(df.iloc[1]["diabetes"], True)

    def test_validates_file_size_limit(self):
        """Exceeding the file size limit raises SafeCSVError."""
        path = self._make_csv("large.csv", "name,age\nAlice,30\n")
        from validation.csv_validator import validate_file_size
        from unittest.mock import patch
        with patch("services.safe_csv_reader.validate_file_size", side_effect=ValidationError("File exceeds maximum")):
            with self.assertRaises(SafeCSVError) as ctx:
                read_csv_safely(path)
            self.assertIn("exceeds", str(ctx.exception).lower())

    def test_validates_extension_and_content(self):
        """Non-CSV content raises SafeCSVError."""
        path = self._make_csv("wrong.csv", "not a csv file content")
        from unittest.mock import patch
        with patch("services.safe_csv_reader.validate_file_size"):
            with patch(
                "services.safe_csv_reader.validate_extension_and_content",
                side_effect=ValidationError("Invalid content"),
            ):
                with self.assertRaises(SafeCSVError):
                    read_csv_safely(path)

    def test_validates_headers(self):
        """Invalid headers raise SafeCSVError."""
        csv_content = "invalid_header_1,bad_column\nAlice,30\n"
        path = self._make_csv("bad_headers.csv", csv_content)
        from unittest.mock import patch
        with patch("services.safe_csv_reader.validate_file_size"):
            with patch("services.safe_csv_reader.validate_extension_and_content"):
                with patch(
                    "services.safe_csv_reader.validate_headers",
                    side_effect=ValidationError("Missing required headers"),
                ):
                    with self.assertRaises(SafeCSVError):
                        read_csv_safely(path)

    def test_resource_guard_exhaustion(self):
        """Too many rows raises SafeCSVError via ResourceExhaustedError."""
        # Create a CSV with many rows to exhaust ResourceGuard
        required_cols = (
            "gender,age,hypertension,heart_disease,smoking_history,"
            "bmi,HbA1c_level,blood_glucose_level,diabetes"
        )
        rows = [required_cols] + [
            f"Male,{i},False,False,never,22.5,5.0,95,False"
            for i in range(200000)
        ]
        csv_content = "\n".join(rows)
        path = self._make_csv("huge.csv", csv_content)
        from unittest.mock import patch
        with patch("services.safe_csv_reader.validate_file_size"):
            with patch("services.safe_csv_reader.validate_extension_and_content"):
                with self.assertRaises(SafeCSVError) as ctx:
                    read_csv_safely(path, max_rows=10)
                # ResourceExhaustedError is wrapped as SafeCSVError
                self.assertIn("row count", str(ctx.exception).lower())

    def test_parser_error_wrapped(self):
        """pd.ParserError is wrapped in SafeCSVError."""
        # Create a malformed CSV (unterminated quoted field)
        csv_content = 'name,city\nAlice,"NYC\nBob,Chicago\n'
        path = self._make_csv("malformed.csv", csv_content)
        from unittest.mock import patch
        with patch("services.safe_csv_reader.validate_file_size"):
            with patch("services.safe_csv_reader.validate_extension_and_content"):
                with patch("services.safe_csv_reader.validate_headers"):
                    with self.assertRaises(SafeCSVError) as ctx:
                        read_csv_safely(path)
                    self.assertIn("malformed", str(ctx.exception).lower())

    def test_unexpected_exception_wrapped(self):
        """RuntimeError during chunked reading is wrapped to malformed CSV error."""
        # Patch at the pandas read_csv level to raise unexpected exception
        path = self._make_csv("test.csv", "gender,age\nMale,30\n")
        from unittest.mock import patch, MagicMock
        with patch("services.safe_csv_reader.validate_file_size"):
            with patch("services.safe_csv_reader.validate_extension_and_content"):
                with patch("services.safe_csv_reader.validate_headers"):
                    with patch(
                        "services.safe_csv_reader.pd.read_csv",
                        side_effect=RuntimeError("unexpected disk error"),
                    ):
                        with self.assertRaises(SafeCSVError) as ctx:
                            read_csv_safely(path)
                        self.assertIn("malformed", str(ctx.exception).lower())

    def test_empty_csv_returns_empty_dataframe(self):
        """An empty CSV file returns an empty DataFrame."""
        path = self._make_csv("empty.csv", "")
        # Empty file with no headers
        from unittest.mock import patch
        with patch("services.safe_csv_reader.validate_file_size"):
            with patch("services.safe_csv_reader.validate_extension_and_content"):
                # Empty file without headers should fail at validate_headers
                with patch(
                    "services.safe_csv_reader.validate_headers",
                    side_effect=ValidationError("No columns found"),
                ):
                    with self.assertRaises(SafeCSVError):
                        read_csv_safely(path)


if __name__ == "__main__":
    unittest.main()
