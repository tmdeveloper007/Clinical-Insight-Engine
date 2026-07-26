"""
Unit tests for app.middleware.phi_redaction — phi_redaction_middleware decorator.
"""

import os
import sys

import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from app.middleware.phi_redaction import phi_redaction_middleware


class TestPHIRedactionMiddleware:
    """Tests for the phi_redaction_middleware decorator."""

    def test_decorator_calls_wrapped_function(self):
        """Decorator calls the wrapped function and returns its result."""
        @phi_redaction_middleware
        def my_func(x, y):
            return x + y

        result = my_func(2, 3)
        assert result == 5

    def test_decorator_redacts_patientName_dict_positional_argument(self):
        """Dict with patientName key is redacted before being passed to the function."""
        calls = []

        @phi_redaction_middleware
        def my_func(data):
            calls.append(data)
            return "ok"

        result = my_func({"patientName": "John Doe", "age": 30})
        # patientName should be redacted to [PATIENT_NAME]
        assert calls[0]["patientName"] == "[PATIENT_NAME]"
        assert calls[0]["age"] == 30

    def test_decorator_redacts_email_dict_positional_argument(self):
        """Dict with email key is redacted to [EMAIL]."""
        calls = []

        @phi_redaction_middleware
        def my_func(data):
            calls.append(data)
            return "ok"

        result = my_func({"email": "patient@example.com", "bmi": 25})
        assert calls[0]["email"] == "[EMAIL]"
        assert calls[0]["bmi"] == 25

    def test_decorator_redacts_list_of_dicts_positional_argument(self):
        """List of dicts positional argument is redacted before being passed to the function."""
        calls = []

        @phi_redaction_middleware
        def my_func(data_list):
            calls.append(data_list)
            return "ok"

        result = my_func([{"patientName": "Alice"}, {"patientName": "Bob"}])
        assert calls[0][0]["patientName"] == "[PATIENT_NAME]"
        assert calls[0][1]["patientName"] == "[PATIENT_NAME]"

    def test_decorator_redacts_long_string_positional_argument(self):
        """Long string (>30 chars) with PHI indicators is processed by PHIRedactor."""
        calls = []

        @phi_redaction_middleware
        def my_func(text):
            calls.append(text)
            return "ok"

        result = my_func("Patient John Doe MRN 12345 Address 123 Main St Phone 555-1234")
        # PHIRedactor detects patient name, MRN, and address patterns
        assert "[PATIENT_NAME]" in calls[0]
        assert "[PATIENT_ID]" in calls[0]
        assert "[ADDRESS]" in calls[0]

    def test_decorator_does_not_redact_short_string_positional_argument(self):
        """Short string (<=30 chars, no indicators) positional argument is passed through."""
        calls = []

        @phi_redaction_middleware
        def my_func(text):
            calls.append(text)
            return "ok"

        result = my_func("hello world")
        assert calls[0] == "hello world"

    def test_decorator_redacts_email_string_positional_argument(self):
        """String containing '@' is processed by PHIRedactor which detects email patterns."""
        calls = []

        @phi_redaction_middleware
        def my_func(text):
            calls.append(text)
            return "ok"

        result = my_func("contact@example.com")
        assert "[EMAIL]" in calls[0]

    def test_decorator_redacts_mrn_string_positional_argument(self):
        """String containing 'MRN' indicator is processed by PHIRedactor."""
        calls = []

        @phi_redaction_middleware
        def my_func(text):
            calls.append(text)
            return "ok"

        result = my_func("Patient MRN 12345")
        assert "[PATIENT_ID]" in calls[0]

    def test_decorator_passes_non_phi_positional_argument_through(self):
        """Non-dict, non-list, non-string positional args pass through unchanged."""
        calls = []

        @phi_redaction_middleware
        def my_func(model, features):
            calls.append((model, features))
            return "ok"

        result = my_func("sklearn_model", ["feature1", "feature2"])
        assert calls[0] == ("sklearn_model", ["feature1", "feature2"])

    def test_decorator_redacts_input_data_keyword_argument(self):
        """Keyword argument named 'input_data' is redacted."""
        calls = []

        @phi_redaction_middleware
        def my_func(input_data=None):
            calls.append(input_data)
            return "ok"

        result = my_func(input_data={"patientName": "Jane Doe"})
        assert calls[0]["patientName"] == "[PATIENT_NAME]"

    def test_decorator_redacts_patient_data_keyword_argument(self):
        """Keyword argument named 'patient_data' is redacted."""
        calls = []

        @phi_redaction_middleware
        def my_func(patient_data=None):
            calls.append(patient_data)
            return "ok"

        result = my_func(patient_data={"email": "test@example.com"})
        assert calls[0]["email"] == "[EMAIL]"

    def test_decorator_redacts_data_keyword_argument(self):
        """Keyword argument named 'data' is redacted."""
        calls = []

        @phi_redaction_middleware
        def my_func(data=None):
            calls.append(data)
            return "ok"

        result = my_func(data={"patientName": "Test User", "phone": "555-1234"})
        assert calls[0]["patientName"] == "[PATIENT_NAME]"
        assert calls[0]["phone"] == "[PHONE]"

    def test_decorator_does_not_redact_model_keyword_argument(self):
        """Keyword argument named 'model' is not redacted."""
        calls = []

        @phi_redaction_middleware
        def my_func(model=None):
            calls.append(model)
            return "ok"

        result = my_func(model={"type": "logistic_regression"})
        # 'model' key is structural, should pass through unchanged
        assert calls[0] == {"type": "logistic_regression"}

    def test_decorator_does_not_redact_features_keyword_argument(self):
        """Keyword argument named 'features' is not redacted."""
        calls = []

        @phi_redaction_middleware
        def my_func(features=None):
            calls.append(features)
            return "ok"

        result = my_func(features=["bmi", "age", "hba1c"])
        assert calls[0] == ["bmi", "age", "hba1c"]

    def test_decorator_passes_through_numeric_arguments(self):
        """Numeric positional arguments pass through unchanged."""
        calls = []

        @phi_redaction_middleware
        def my_func(threshold, count):
            calls.append((threshold, count))
            return "ok"

        result = my_func(0.7, 100)
        assert calls[0] == (0.7, 100)

    def test_decorator_handles_empty_list_argument(self):
        """Empty list argument is handled without error."""
        calls = []

        @phi_redaction_middleware
        def my_func(items):
            calls.append(items)
            return "ok"

        result = my_func([])
        assert calls[0] == []

    def test_decorator_with_non_phi_dict_passes_through(self):
        """Dict with non-PHI keys passes through with structural values unchanged."""
        calls = []

        @phi_redaction_middleware
        def my_func(data):
            calls.append(data)
            return "ok"

        # Dict with only non-standard PHI keys should be processed
        # but not have values changed (since keys are not recognized PHI fields)
        result = my_func({"bmi": 25.0, "age": 30})
        assert calls[0]["bmi"] == 25.0
        assert calls[0]["age"] == 30
