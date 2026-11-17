from copy import deepcopy
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from src import app as app_module


class UnregisterParticipantTests(unittest.TestCase):
    def setUp(self):
        activities_patch = patch.object(app_module, "activities", deepcopy(app_module.activities))
        activities_patch.start()
        self.addCleanup(activities_patch.stop)
        self.client = TestClient(app_module.app)
        self.addCleanup(self.client.close)

    def test_unregister_removes_only_selected_participant_and_allows_signup_again(self):
        email = "michael@mergington.edu"
        response = self.client.delete(
            "/activities/Chess%20Club/participants", params={"email": email}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"message": f"Unregistered {email} from Chess Club"})
        activity = self.client.get("/activities").json()["Chess Club"]
        self.assertEqual(activity["participants"], ["daniel@mergington.edu"])
        self.assertEqual(activity["max_participants"] - len(activity["participants"]), 11)

        response = self.client.post("/activities/Chess%20Club/signup", params={"email": email})
        self.assertEqual(response.status_code, 200)

    def test_unregister_missing_activity(self):
        before = deepcopy(app_module.activities)
        response = self.client.delete(
            "/activities/Unknown/participants", params={"email": "michael@mergington.edu"}
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json(), {"detail": "Activity not found"})
        self.assertEqual(app_module.activities, before)

    def test_unregister_missing_participant(self):
        before = deepcopy(app_module.activities)
        response = self.client.delete(
            "/activities/Chess%20Club/participants", params={"email": "missing@mergington.edu"}
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.json(), {"detail": "Student is not registered for this activity"}
        )
        self.assertEqual(app_module.activities, before)
