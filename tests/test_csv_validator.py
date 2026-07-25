"""
Unit tests for validation/csv_validator.py.
OWASP-aligned CSV upload validation helpers.
"""
import os
import tempfile
import pytest
from validation.csv_validator import (
    validate_file_size,
    validate_headers,
    validate_extension_and_content,
    ValidationError,
    REQUIRED_HEADERS,
)


class TestValidateFileSize:
    """Test suite for validate_file_size."""

    def test_valid_size_under_limit(self):
        with tempfile.NamedTemporaryFile(delete=False) as f:
            f.write(b"x" * 1024)
            f.flush()
            filepath = f.name
        try:
            validate_file_size(filepath)  # should not raise
        finally:
            os.unlink(filepath)

    def test_file_not_found_raises(self):
        with pytest.raises(ValidationError, match="File not found"):
            validate_file_size("/nonexistent/path/to/file.csv")

    def test_file_exceeds_max_size(self):
        with tempfile.NamedTemporaryFile(delete=False) as f:
            # Write more than 10MB
            f.write(b"x" * (11 * 1024 * 1024))
            f.flush()
            filepath = f.name
        try:
            with pytest.raises(ValidationError, match="exceeds maximum allowed size"):
                validate_file_size(filepath)
        finally:
            os.unlink(filepath)

    def test_custom_max_size(self):
        with tempfile.NamedTemporaryFile(delete=False) as f:
            f.write(b"x" * 2048)
            f.flush()
            filepath = f.name
        try:
            with pytest.raises(ValidationError, match="exceeds maximum allowed size"):
                validate_file_size(filepath, max_size=1024)
        finally:
            os.unlink(filepath)

    def test_file_at_exact_max_size(self):
        with tempfile.NamedTemporaryFile(delete=False) as f:
            # Write exactly 10MB
            f.write(b"x" * (10 * 1024 * 1024))
            f.flush()
            filepath = f.name
        try:
            validate_file_size(filepath)  # exactly at limit should not raise
        finally:
            os.unlink(filepath)


class TestValidateHeaders:
    """Test suite for validate_headers."""

    def test_all_required_headers_present(self):
        headers = ["gender", "age", "hypertension", "heart_disease",
                   "smoking_history", "bmi", "HbA1c_level", "blood_glucose_level", "diabetes"]
        validate_headers(headers)  # should not raise

    def test_all_required_headers_with_extra(self):
        headers = ["gender", "age", "hypertension", "heart_disease",
                   "smoking_history", "bmi", "HbA1c_level", "blood_glucose_level",
                   "diabetes", "extra_column"]
        validate_headers(headers)  # should not raise

    def test_missing_single_header_raises(self):
        headers = ["gender", "age", "hypertension", "heart_disease",
                   "smoking_history", "bmi", "HbA1c_level", "blood_glucose_level"]
        with pytest.raises(ValidationError, match="Missing required headers"):
            validate_headers(headers)

    def test_missing_multiple_headers_raises(self):
        headers = ["gender", "age"]
        with pytest.raises(ValidationError, match="Missing required headers"):
            validate_headers(headers)

    def test_empty_headers_raises(self):
        with pytest.raises(ValidationError, match="Missing required headers"):
            validate_headers([])

    def test_headers_case_sensitive(self):
        # Headers are case-sensitive, so capitalizing should fail
        headers = ["Gender", "Age", "Hypertension", "Heart_Disease",
                   "Smoking_History", "Bmi", "HbA1c_Level", "Blood_Glucose_Level", "Diabetes"]
        with pytest.raises(ValidationError, match="Missing required headers"):
            validate_headers(headers)


class TestValidateExtensionAndContent:
    """Test suite for validate_extension_and_content."""

    def test_valid_csv_extension(self):
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as f:
            f.write(b"gender,age\nMale,30\n")
            f.flush()
            filepath = f.name
        try:
            validate_extension_and_content(filepath)  # should not raise
        finally:
            os.unlink(filepath)

    def test_valid_txt_extension(self):
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as f:
            f.write(b"gender,age\nMale,30\n")
            f.flush()
            filepath = f.name
        try:
            validate_extension_and_content(filepath)  # should not raise
        finally:
            os.unlink(filepath)

    def test_invalid_extension_raises(self):
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
            f.write(b"gender,age\nMale,30\n")
            f.flush()
            filepath = f.name
        try:
            with pytest.raises(ValidationError, match="Invalid file extension"):
                validate_extension_and_content(filepath)
        finally:
            os.unlink(filepath)

    def test_mz_header_pe_executable_rejected(self):
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as f:
            # MZ header (PE executable)
            f.write(b"MZ" + b"\x00" * 100)
            f.flush()
            filepath = f.name
        try:
            with pytest.raises(ValidationError, match="PE/MZ executable format"):
                validate_extension_and_content(filepath)
        finally:
            os.unlink(filepath)

    def test_elf_header_rejected(self):
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as f:
            # ELF magic bytes
            f.write(b"\x7fELF" + b"\x00" * 100)
            f.flush()
            filepath = f.name
        try:
            with pytest.raises(ValidationError, match="ELF binary format"):
                validate_extension_and_content(filepath)
        finally:
            os.unlink(filepath)

    def test_macho_header_rejected(self):
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as f:
            # Mach-O magic bytes (little-endian)
            f.write(b"\xfe\xed\xfa\xce" + b"\x00" * 100)
            f.flush()
            filepath = f.name
        try:
            with pytest.raises(ValidationError, match="Mach-O binary format"):
                validate_extension_and_content(filepath)
        finally:
            os.unlink(filepath)

    def test_shebang_header_rejected(self):
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as f:
            f.write(b"#!/bin/bash\necho 'malicious'\n")
            f.flush()
            filepath = f.name
        try:
            with pytest.raises(ValidationError, match="Shebang script headers"):
                validate_extension_and_content(filepath)
        finally:
            os.unlink(filepath)

    def test_normal_csv_content_accepted(self):
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as f:
            f.write(b"gender,age,name\nMale,30,John\n")
            f.flush()
            filepath = f.name
        try:
            validate_extension_and_content(filepath)  # should not raise
        finally:
            os.unlink(filepath)
