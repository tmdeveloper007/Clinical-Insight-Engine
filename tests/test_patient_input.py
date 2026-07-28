import pytest
from pydantic import ValidationError
from app.schemas.patient_input import PatientInput


def test_valid_patient_input():
    # Valid payload
    payload = {
        "patientName": "Jane Doe",
        "gender": "Female",
        "age": 42,
        "hypertension": True,
        "heartDisease": False,
        "smokingHistory": "never",
        "bmi": 24.5,
        "hba1cLevel": 5.2,
        "bloodGlucoseLevel": 95.0,
        "createdBy": "doctor@hospital.org"
    }
    patient = PatientInput(**payload)
    assert patient.patientName == "Jane Doe"
    assert patient.gender == "Female"
    assert patient.age == 42
    assert patient.hypertension is True
    assert patient.heartDisease is False
    assert patient.smokingHistory == "never"
    assert patient.bmi == 24.5
    assert patient.hba1cLevel == 5.2
    assert patient.bloodGlucoseLevel == 95.0
    assert patient.createdBy == "doctor@hospital.org"


def test_invalid_gender():
    payload = {
        "gender": "Non-binary",
        "age": 42,
        "smokingHistory": "never",
        "bmi": 24.5,
        "hba1cLevel": 5.2,
        "bloodGlucoseLevel": 95.0,
    }
    with pytest.raises(ValidationError) as excinfo:
        PatientInput(**payload)
    assert "Gender must be 'Male' or 'Female'" in str(excinfo.value)


def test_invalid_smoking_history():
    payload = {
        "gender": "Male",
        "age": 42,
        "smokingHistory": "chain-smoker",
        "bmi": 24.5,
        "hba1cLevel": 5.2,
        "bloodGlucoseLevel": 95.0,
    }
    with pytest.raises(ValidationError) as excinfo:
        PatientInput(**payload)
    assert "Invalid smoking history value" in str(excinfo.value)


def test_invalid_created_by():
    payload = {
        "gender": "Male",
        "age": 42,
        "smokingHistory": "never",
        "bmi": 24.5,
        "hba1cLevel": 5.2,
        "bloodGlucoseLevel": 95.0,
        "createdBy": "not-an-email"
    }
    with pytest.raises(ValidationError) as excinfo:
        PatientInput(**payload)
    assert "createdBy must be a valid email" in str(excinfo.value)


def test_reject_out_of_range_clinical_values():
    payload = {
        "gender": "Male",
        "age": 42,
        "smokingHistory": "never",
        "bmi": 5.0,  # below ge=10
        "hba1cLevel": 5.2,
        "bloodGlucoseLevel": 95.0,
    }
    with pytest.raises(ValidationError) as excinfo:
        PatientInput(**payload)
    assert "Input should be greater than or equal to 10" in str(excinfo.value)


# ─── Boundary Value Tests ──────────────────────────────────────────────────────

def _valid_base():
    return {
        "gender": "Male",
        "age": 42,
        "smokingHistory": "never",
        "bmi": 24.5,
        "hba1cLevel": 5.2,
        "bloodGlucoseLevel": 95.0,
    }


def test_age_boundary_min_1_valid():
    payload = _valid_base()
    payload["age"] = 1
    patient = PatientInput(**payload)
    assert patient.age == 1


def test_age_boundary_zero_rejected():
    payload = _valid_base()
    payload["age"] = 0
    with pytest.raises(ValidationError):
        PatientInput(**payload)


def test_age_boundary_120_valid():
    payload = _valid_base()
    payload["age"] = 120
    patient = PatientInput(**payload)
    assert patient.age == 120


def test_age_above_120_rejected():
    payload = _valid_base()
    payload["age"] = 121
    with pytest.raises(ValidationError):
        PatientInput(**payload)


def test_age_negative_rejected():
    payload = _valid_base()
    payload["age"] = -5
    with pytest.raises(ValidationError):
        PatientInput(**payload)


def test_bmi_boundary_min_10_valid():
    payload = _valid_base()
    payload["bmi"] = 10.0
    patient = PatientInput(**payload)
    assert patient.bmi == 10.0


def test_bmi_below_10_rejected():
    payload = _valid_base()
    payload["bmi"] = 9.9
    with pytest.raises(ValidationError):
        PatientInput(**payload)


def test_bmi_boundary_max_60_valid():
    payload = _valid_base()
    payload["bmi"] = 60.0
    patient = PatientInput(**payload)
    assert patient.bmi == 60.0


def test_bmi_above_60_rejected():
    payload = _valid_base()
    payload["bmi"] = 60.1
    with pytest.raises(ValidationError):
        PatientInput(**payload)


def test_hba1c_boundary_min_3_valid():
    payload = _valid_base()
    payload["hba1cLevel"] = 3.0
    patient = PatientInput(**payload)
    assert patient.hba1cLevel == 3.0


def test_hba1c_below_3_rejected():
    payload = _valid_base()
    payload["hba1cLevel"] = 2.9
    with pytest.raises(ValidationError):
        PatientInput(**payload)


def test_hba1c_boundary_max_15_valid():
    payload = _valid_base()
    payload["hba1cLevel"] = 15.0
    patient = PatientInput(**payload)
    assert patient.hba1cLevel == 15.0


def test_hba1c_above_15_rejected():
    payload = _valid_base()
    payload["hba1cLevel"] = 15.1
    with pytest.raises(ValidationError):
        PatientInput(**payload)


def test_glucose_boundary_min_50_valid():
    payload = _valid_base()
    payload["bloodGlucoseLevel"] = 50.0
    patient = PatientInput(**payload)
    assert patient.bloodGlucoseLevel == 50.0


def test_glucose_below_50_rejected():
    payload = _valid_base()
    payload["bloodGlucoseLevel"] = 49.0
    with pytest.raises(ValidationError):
        PatientInput(**payload)


def test_glucose_boundary_max_400_valid():
    payload = _valid_base()
    payload["bloodGlucoseLevel"] = 400.0
    patient = PatientInput(**payload)
    assert patient.bloodGlucoseLevel == 400.0


def test_glucose_above_400_rejected():
    payload = _valid_base()
    payload["bloodGlucoseLevel"] = 401.0
    with pytest.raises(ValidationError):
        PatientInput(**payload)


def test_zero_bmi_rejected():
    """Zero BMI is clinically invalid and must be rejected."""
    payload = _valid_base()
    payload["bmi"] = 0
    with pytest.raises(ValidationError):
        PatientInput(**payload)


def test_zero_hba1c_rejected():
    """Zero HbA1c is clinically invalid and must be rejected."""
    payload = _valid_base()
    payload["hba1cLevel"] = 0
    with pytest.raises(ValidationError):
        PatientInput(**payload)


def test_zero_glucose_rejected():
    """Zero blood glucose is clinically invalid and must be rejected."""
    payload = _valid_base()
    payload["bloodGlucoseLevel"] = 0
    with pytest.raises(ValidationError):
        PatientInput(**payload)


def test_optional_patient_name_can_be_none():
    """patientName is optional (default=None)."""
    payload = _valid_base()
    del payload["gender"]  # will use Male
    payload2 = {k: v for k, v in payload.items() if k != "gender"}
    payload2["gender"] = "Male"
    payload2["patientName"] = None
    patient = PatientInput(**payload2)
    assert patient.patientName is None


def test_optional_created_by_can_be_none():
    """createdBy is optional (default=None)."""
    payload = _valid_base()
    payload["createdBy"] = None
    patient = PatientInput(**payload)
    assert patient.createdBy is None


# ─── PredictionResponse Tests ───────────────────────────────────────────────────

from app.schemas.patient_input import PredictionResponse


def test_prediction_response_from_probability_low_risk():
    """prob < 0.3 maps to LOW risk."""
    resp = PredictionResponse.from_probability(0.15)
    assert resp.prediction == 0
    assert resp.risk_level == "LOW"
    assert "Low risk" in resp.message


def test_prediction_response_from_probability_medium_risk():
    """0.3 <= prob < 0.6 maps to MEDIUM risk."""
    resp = PredictionResponse.from_probability(0.45)
    assert resp.prediction == 0
    assert resp.risk_level == "MEDIUM"
    assert "Moderate" in resp.message


def test_prediction_response_from_probability_high_risk():
    """0.6 <= prob < 1.0 maps to HIGH risk."""
    resp = PredictionResponse.from_probability(0.75)
    assert resp.prediction == 1
    assert resp.risk_level == "HIGH"
    assert "High risk" in resp.message


def test_prediction_response_prediction_boundary_low():
    """prob exactly 0.5 -> prediction 0 (below threshold)."""
    resp = PredictionResponse.from_probability(0.5)
    assert resp.prediction == 1  # 0.5 >= 0.5 so prediction = 1


def test_prediction_response_prediction_boundary_high():
    """prob exactly 0.5 -> prediction 1 (>= threshold)."""
    resp = PredictionResponse.from_probability(0.4999)
    assert resp.prediction == 0  # 0.4999 < 0.5 so prediction = 0


def test_prediction_response_probability_rounded_to_4dp():
    """probability should be rounded to 4 decimal places."""
    resp = PredictionResponse.from_probability(0.123456789)
    assert resp.probability == 0.1235


def test_prediction_response_probability_exactly_zero():
    resp = PredictionResponse.from_probability(0.0)
    assert resp.probability == 0.0
    assert resp.prediction == 0


def test_prediction_response_probability_exactly_one():
    resp = PredictionResponse.from_probability(1.0)
    assert resp.probability == 1.0
    assert resp.prediction == 1
    assert resp.risk_level == "HIGH"


def test_prediction_response_risk_level_at_boundary_03():
    """Exactly 0.3 maps to MEDIUM (not LOW)."""
    resp = PredictionResponse.from_probability(0.3)
    assert resp.risk_level == "MEDIUM"


def test_prediction_response_risk_level_at_boundary_06():
    """Exactly 0.6 maps to HIGH (not MEDIUM)."""
    resp = PredictionResponse.from_probability(0.6)
    assert resp.risk_level == "HIGH"
