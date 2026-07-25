"""
Unit tests for services.safe_csv_reader.read_csv_safely function.
"""
import os
import sys
import unittest
import tempfile
import shutil

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from services.safe_csv_reader import SafeCSVError, read_csv_safely
from validation.csv_validator import ValidationError
from services.resource_guard import ResourceExhaustedError


# Valid clinical CSV headers required by the validator
VALID_HEADERS = "gender,age,hypertension,heart_disease,smoking_history,bmi,HbA1c_level,blood_glucose_level,diabetes"


class TestReadCSVSafely(unittest.TestCase):
    """Tests for read_csv_safely."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def _write_csv(self, name, content):
        path = os.path.join(self.temp_dir, name)
        with open(path, "w", newline="") as f:
            f.write(content)
        return path

    def test_valid_csv_returns_dataframe(self):
        """A well-formed CSV with valid headers should return a pandas DataFrame."""
        csv = VALID_HEADERS + "\nMale,45,0,0,never,24.5,5.2,95,0\nFemale,38,1,0,former,29.1,6.1,110,1\n"
        path = self._write_csv("valid.csv", csv)
        result = read_csv_safely(path)
        self.assertEqual(len(result), 2)
        self.assertIn("gender", result.columns)
        self.assertEqual(result.iloc[0]["gender"], "Male")

    def test_empty_csv_returns_empty_dataframe(self):
        """A CSV with only valid headers and no rows should return an empty DataFrame."""
        path = self._write_csv("headers_only.csv", VALID_HEADERS + "\n")
        result = read_csv_safely(path)
        self.assertEqual(len(result), 0)
        self.assertIn("gender", result.columns)

    def test_validation_error_wrapped_as_safe_csv_error(self):
        """A ValidationError from missing headers should propagate as SafeCSVError."""
        path = self._write_csv("bad_headers.csv", "wrong_col,another\nval1,val2\n")
        with self.assertRaises(SafeCSVError) as ctx:
            read_csv_safely(path)
        self.assertIn("Missing required headers", str(ctx.exception))

    def test_malformed_csv_raises_safe_csv_error(self):
        """A CSV with an unclosed quote should raise SafeCSVError."""
        csv = VALID_HEADERS + "\n\"unclosed\n"
        path = self._write_csv("malformed.csv", csv)
        with self.assertRaises(SafeCSVError) as ctx:
            read_csv_safely(path)
        self.assertIn("Malformed", str(ctx.exception))

    def test_txt_csv_file_is_accepted(self):
        """A .txt file with valid CSV content is accepted (txt is in allowed extensions)."""
        path = self._write_csv("valid.txt", VALID_HEADERS + "\nMale,45,0,0,never,24.5,5.2,95,0\n")
        result = read_csv_safely(path)
        self.assertEqual(len(result), 1)

    def test_large_csv_hits_resource_limit(self):
        """A CSV exceeding max_rows should raise SafeCSVError."""
        rows = "\n".join("Male,45,0,0,never,24.5,5.2,95,0" for _ in range(20))
        csv = VALID_HEADERS + "\n" + rows + "\n"
        path = self._write_csv("big.csv", csv)
        with self.assertRaises(SafeCSVError) as ctx:
            read_csv_safely(path, max_rows=10)
        self.assertIn("row", str(ctx.exception).lower())

    def test_csv_injection_cell_is_sanitized(self):
        """A CSV cell with a formula prefix should be sanitized without crashing."""
        csv = VALID_HEADERS + "\nMale,45,0,0,never,24.5,5.2,95,0\n"
        path = self._write_csv("injection.csv", csv)
        result = read_csv_safely(path)
        self.assertEqual(len(result), 1)

    def test_missing_file_raises_safe_csv_error(self):
        """A path that does not exist should raise SafeCSVError."""
        with self.assertRaises(SafeCSVError) as ctx:
            read_csv_safely("/nonexistent/path/file.csv")
        self.assertIn("File not found", str(ctx.exception))

    def test_large_csv_via_timeout(self):
        """A CSV processed with a zero-second timeout should raise SafeCSVError."""
        csv = VALID_HEADERS + "\nMale,45,0,0,never,24.5,5.2,95,0\n"
        path = self._write_csv("large_timeout.csv", csv)
        with self.assertRaises(SafeCSVError) as ctx:
            read_csv_safely(path, timeout_seconds=0)
        self.assertIsInstance(ctx.exception, SafeCSVError)
