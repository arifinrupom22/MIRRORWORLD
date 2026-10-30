"""Static catalogue for the MIRRORWORLD synthetic demo campus.

All values are illustrative. The dataset is internally consistent and
deterministic; it is not real institutional data.
"""

CAMPUS_NAME = "Meridian Institute of Technology"
DATASET_LABEL = "MIRRORWORLD Synthetic Campus · Fall 2026 · Week 7"

DAYS = [
    {"index": 0, "label": "Monday", "short": "Mon"},
    {"index": 1, "label": "Tuesday", "short": "Tue"},
    {"index": 2, "label": "Wednesday", "short": "Wed"},
    {"index": 3, "label": "Thursday", "short": "Thu"},
    {"index": 4, "label": "Friday", "short": "Fri"},
]

TIME_SLOTS = [
    {"index": 0, "start": "08:00", "end": "09:30", "label": "08:00–09:30"},
    {"index": 1, "start": "09:40", "end": "11:10", "label": "09:40–11:10"},
    {"index": 2, "start": "11:20", "end": "12:50", "label": "11:20–12:50"},
    {"index": 3, "start": "13:00", "end": "14:30", "label": "13:00–14:30"},
    {"index": 4, "start": "14:40", "end": "16:10", "label": "14:40–16:10"},
    {"index": 5, "start": "16:20", "end": "17:50", "label": "16:20–17:50"},
    {"index": 6, "start": "18:00", "end": "19:30", "label": "18:00–19:30"},
]

SLOT_HOURS = 1.5

BUILDINGS = [
    {
        "id": "AT",
        "code": "AT",
        "name": "Alan Turing Hall",
        "zone": "North Quad",
        "purpose": "Computing & Artificial Intelligence",
        "floors": 3,
        "map": {"x": 56, "y": 62, "w": 352, "h": 244},
        "accent": "#38D9F5",
    },
    {
        "id": "FL",
        "code": "FL",
        "name": "Franklin Annex",
        "zone": "North-East",
        "purpose": "Electrical & Electronic Engineering",
        "floors": 2,
        "map": {"x": 468, "y": 48, "w": 470, "h": 228},
        "accent": "#4F8CFF",
    },
    {
        "id": "AD",
        "code": "AD",
        "name": "Ada Lovelace Block",
        "zone": "South Quad",
        "purpose": "Life Sciences & Mathematics",
        "floors": 3,
        "map": {"x": 72, "y": 360, "w": 352, "h": 224},
        "accent": "#8B7CFF",
    },
    {
        "id": "TS",
        "code": "TS",
        "name": "Tesla Engineering Works",
        "zone": "South-East",
        "purpose": "Mechanical, Robotics & Design",
        "floors": 2,
        "map": {"x": 500, "y": 332, "w": 438, "h": 250},
        "accent": "#35D39A",
    },
]

# Building-to-building pedestrian distance in metres (documented simplified model).
DISTANCES = {
    "AT": {"AT": 40, "FL": 180, "AD": 240, "TS": 320},
    "FL": {"AT": 180, "FL": 40, "AD": 300, "TS": 210},
    "AD": {"AT": 240, "FL": 300, "AD": 40, "TS": 280},
    "TS": {"AT": 320, "FL": 210, "AD": 280, "TS": 40},
}

ROOMS = [
    # Alan Turing Hall
    {"id": "AT-101", "building_id": "AT", "code": "AT-101", "name": "Seminar Room 101", "kind": "classroom", "lab_types": [], "capacity": 36, "floor": 1, "power_kw": 3.4, "equipment": ["projector"], "equipment_kw": 0.4},
    {"id": "AT-102", "building_id": "AT", "code": "AT-102", "name": "Studio 102", "kind": "classroom", "lab_types": [], "capacity": 48, "floor": 1, "power_kw": 4.1, "equipment": ["projector", "smartboard"], "equipment_kw": 0.6},
    {"id": "AT-103", "building_id": "AT", "code": "AT-103", "name": "Lecture Hall 103", "kind": "classroom", "lab_types": [], "capacity": 64, "floor": 2, "power_kw": 4.8, "equipment": ["projector"], "equipment_kw": 0.4},
    {"id": "AT-104", "building_id": "AT", "code": "AT-104", "name": "Lecture Hall 104", "kind": "classroom", "lab_types": [], "capacity": 90, "floor": 2, "power_kw": 5.6, "equipment": ["projector", "smartboard"], "equipment_kw": 0.6},
    {"id": "AT-105", "building_id": "AT", "code": "AT-105", "name": "Auditorium 105", "kind": "classroom", "lab_types": [], "capacity": 120, "floor": 3, "power_kw": 7.8, "equipment": ["projector", "smartboard"], "equipment_kw": 0.8},
    {"id": "AT-L1", "building_id": "AT", "code": "AT-L1", "name": "High-Performance Computing Lab", "kind": "lab", "lab_types": ["computer"], "capacity": 72, "floor": 3, "power_kw": 12.0, "equipment": ["cuda", "gpu", "networking"], "equipment_kw": 8.5},
    # Franklin Annex
    {"id": "FL-101", "building_id": "FL", "code": "FL-101", "name": "Tutorial Room 101", "kind": "classroom", "lab_types": [], "capacity": 40, "floor": 1, "power_kw": 4.6, "equipment": ["projector"], "equipment_kw": 0.4},
    {"id": "FL-102", "building_id": "FL", "code": "FL-102", "name": "Tutorial Room 102", "kind": "classroom", "lab_types": [], "capacity": 52, "floor": 1, "power_kw": 5.2, "equipment": ["projector"], "equipment_kw": 0.4},
    {"id": "FL-103", "building_id": "FL", "code": "FL-103", "name": "Lecture Hall 103", "kind": "classroom", "lab_types": [], "capacity": 60, "floor": 2, "power_kw": 5.9, "equipment": ["projector", "smartboard"], "equipment_kw": 0.6},
    {"id": "FL-104", "building_id": "FL", "code": "FL-104", "name": "Lecture Hall 104", "kind": "classroom", "lab_types": [], "capacity": 72, "floor": 2, "power_kw": 6.4, "equipment": ["projector"], "equipment_kw": 0.4},
    {"id": "FL-105", "building_id": "FL", "code": "FL-105", "name": "Systems Auditorium", "kind": "classroom", "lab_types": [], "capacity": 96, "floor": 2, "power_kw": 7.2, "equipment": ["projector", "smartboard"], "equipment_kw": 0.8},
    {"id": "FL-L1", "building_id": "FL", "code": "FL-L1", "name": "Networks & Embedded Lab", "kind": "lab", "lab_types": ["networks", "electronics"], "capacity": 72, "floor": 1, "power_kw": 10.2, "equipment": ["networking", "embedded", "oscilloscope"], "equipment_kw": 6.4},
    # Ada Lovelace Block
    {"id": "AD-101", "building_id": "AD", "code": "AD-101", "name": "Seminar Room 101", "kind": "classroom", "lab_types": [], "capacity": 32, "floor": 1, "power_kw": 3.8, "equipment": ["projector"], "equipment_kw": 0.3},
    {"id": "AD-102", "building_id": "AD", "code": "AD-102", "name": "Seminar Room 102", "kind": "classroom", "lab_types": [], "capacity": 44, "floor": 1, "power_kw": 4.4, "equipment": ["projector"], "equipment_kw": 0.3},
    {"id": "AD-103", "building_id": "AD", "code": "AD-103", "name": "Lecture Room 103", "kind": "classroom", "lab_types": [], "capacity": 56, "floor": 2, "power_kw": 5.0, "equipment": ["projector"], "equipment_kw": 0.4},
    {"id": "AD-104", "building_id": "AD", "code": "AD-104", "name": "Lecture Room 104", "kind": "classroom", "lab_types": [], "capacity": 72, "floor": 2, "power_kw": 5.8, "equipment": ["projector", "smartboard"], "equipment_kw": 0.5},
    {"id": "AD-105", "building_id": "AD", "code": "AD-105", "name": "Life Sciences Auditorium", "kind": "classroom", "lab_types": [], "capacity": 88, "floor": 3, "power_kw": 6.8, "equipment": ["projector"], "equipment_kw": 0.4},
    {"id": "AD-L1", "building_id": "AD", "code": "AD-L1", "name": "Materials & Biochemistry Lab", "kind": "lab", "lab_types": ["chemistry", "biology"], "capacity": 72, "floor": 3, "power_kw": 11.4, "equipment": ["fumehood", "spectrometer"], "equipment_kw": 7.1},
    # Tesla Engineering Works
    {"id": "TS-101", "building_id": "TS", "code": "TS-101", "name": "Design Studio 101", "kind": "classroom", "lab_types": [], "capacity": 36, "floor": 1, "power_kw": 3.2, "equipment": ["smartboard"], "equipment_kw": 0.4},
    {"id": "TS-102", "building_id": "TS", "code": "TS-102", "name": "Design Studio 102", "kind": "classroom", "lab_types": [], "capacity": 48, "floor": 1, "power_kw": 3.9, "equipment": ["projector"], "equipment_kw": 0.4},
    {"id": "TS-103", "building_id": "TS", "code": "TS-103", "name": "Workshop Classroom 103", "kind": "classroom", "lab_types": [], "capacity": 60, "floor": 2, "power_kw": 4.7, "equipment": ["projector"], "equipment_kw": 0.4},
    {"id": "TS-104", "building_id": "TS", "code": "TS-104", "name": "Engineering Hall 104", "kind": "classroom", "lab_types": [], "capacity": 78, "floor": 2, "power_kw": 5.4, "equipment": ["projector", "smartboard"], "equipment_kw": 0.6},
    {"id": "TS-105", "building_id": "TS", "code": "TS-105", "name": "Engineering Auditorium", "kind": "classroom", "lab_types": [], "capacity": 100, "floor": 2, "power_kw": 6.6, "equipment": ["projector"], "equipment_kw": 0.5},
    {"id": "TS-L1", "building_id": "TS", "code": "TS-L1", "name": "Robotics & Electronics Lab", "kind": "lab", "lab_types": ["robotics", "electronics"], "capacity": 72, "floor": 1, "power_kw": 11.8, "equipment": ["robotics", "oscilloscope", "3dprinter"], "equipment_kw": 8.0},
]

TEACHERS = [
    {"id": "T-01", "name": "Dr. Ayesha Rahman", "department": "CSE", "title": "Associate Professor", "max_weekly_hours": 12, "unavailable": [[0, 0], [0, 1]]},
    {"id": "T-02", "name": "Prof. Imran Hossain", "department": "CSE", "title": "Professor", "max_weekly_hours": 12, "unavailable": []},
    {"id": "T-03", "name": "Dr. Nusrat Jahan", "department": "CSE", "title": "Assistant Professor", "max_weekly_hours": 12, "unavailable": [[2, 5], [2, 6]]},
    {"id": "T-04", "name": "Dr. Tanvir Ahmed", "department": "CSE", "title": "Associate Professor", "max_weekly_hours": 12, "unavailable": []},
    {"id": "T-05", "name": "Prof. Farhana Islam", "department": "DS", "title": "Professor", "max_weekly_hours": 14, "unavailable": []},
    {"id": "T-06", "name": "Dr. Sabbir Khan", "department": "DS", "title": "Assistant Professor", "max_weekly_hours": 12, "unavailable": []},
    {"id": "T-07", "name": "Dr. Rezaul Karim", "department": "EEE", "title": "Professor", "max_weekly_hours": 14, "unavailable": [[4, 5], [4, 6]]},
    {"id": "T-08", "name": "Prof. Shirin Akter", "department": "EEE", "title": "Associate Professor", "max_weekly_hours": 14, "unavailable": []},
    {"id": "T-09", "name": "Dr. Mahmudul Hasan", "department": "EEE", "title": "Assistant Professor", "max_weekly_hours": 12, "unavailable": []},
    {"id": "T-10", "name": "Dr. Farzana Chowdhury", "department": "BBA", "title": "Professor", "max_weekly_hours": 14, "unavailable": []},
    {"id": "T-11", "name": "Prof. Kamrul Islam", "department": "BBA", "title": "Associate Professor", "max_weekly_hours": 14, "unavailable": []},
    {"id": "T-12", "name": "Dr. Rubaiyat Hossain", "department": "BBA", "title": "Assistant Professor", "max_weekly_hours": 12, "unavailable": []},
    {"id": "T-13", "name": "Dr. Selina Parvin", "department": "BIO", "title": "Professor", "max_weekly_hours": 14, "unavailable": [[1, 0], [1, 1]]},
    {"id": "T-14", "name": "Prof. Anwarul Azim", "department": "BIO", "title": "Associate Professor", "max_weekly_hours": 14, "unavailable": []},
    {"id": "T-15", "name": "Dr. Mehedi Hasan", "department": "BIO", "title": "Assistant Professor", "max_weekly_hours": 12, "unavailable": []},
    {"id": "T-16", "name": "Dr. Shahriar Kabir", "department": "ME", "title": "Professor", "max_weekly_hours": 14, "unavailable": []},
    {"id": "T-17", "name": "Prof. Nazma Begum", "department": "ME", "title": "Associate Professor", "max_weekly_hours": 12, "unavailable": []},
    {"id": "T-18", "name": "Dr. Asif Iqbal", "department": "ME", "title": "Assistant Professor", "max_weekly_hours": 12, "unavailable": []},
    {"id": "T-19", "name": "Prof. Jamilur Reza", "department": "ARCH", "title": "Professor", "max_weekly_hours": 14, "unavailable": []},
    {"id": "T-20", "name": "Dr. Farah Deeba", "department": "ARCH", "title": "Assistant Professor", "max_weekly_hours": 12, "unavailable": []},
    {"id": "T-21", "name": "Dr. Mizanur Rahman", "department": "CIV", "title": "Professor", "max_weekly_hours": 14, "unavailable": []},
    {"id": "T-22", "name": "Prof. Salma Khatun", "department": "CIV", "title": "Associate Professor", "max_weekly_hours": 12, "unavailable": []},
    {"id": "T-23", "name": "Dr. Khaled Saifullah", "department": "MATH", "title": "Professor", "max_weekly_hours": 16, "unavailable": []},
    {"id": "T-24", "name": "Dr. Tahmina Akter", "department": "MATH", "title": "Associate Professor", "max_weekly_hours": 16, "unavailable": []},
    {"id": "T-25", "name": "Dr. Rashedul Islam", "department": "CSE", "title": "Assistant Professor", "max_weekly_hours": 10, "unavailable": [[3, 4], [3, 5]]},
    {"id": "T-26", "name": "Prof. Gowher Rizvi", "department": "DS", "title": "Professor", "max_weekly_hours": 12, "unavailable": []},
]

GROUPS = [
    {"id": "CSE-21", "name": "CSE-21", "department": "CSE", "batch": "21", "size": 56, "home_building_id": "AT"},
    {"id": "CSE-22", "name": "CSE-22", "department": "CSE", "batch": "22", "size": 48, "home_building_id": "AT"},
    {"id": "CSE-23", "name": "CSE-23", "department": "CSE", "batch": "23", "size": 60, "home_building_id": "AT"},
    {"id": "CSE-24", "name": "CSE-24", "department": "CSE", "batch": "24", "size": 42, "home_building_id": "AT"},
    {"id": "DS-21", "name": "DS-21", "department": "DS", "batch": "21", "size": 54, "home_building_id": "AT"},
    {"id": "DS-22", "name": "DS-22", "department": "DS", "batch": "22", "size": 48, "home_building_id": "AT"},
    {"id": "EEE-21", "name": "EEE-21", "department": "EEE", "batch": "21", "size": 44, "home_building_id": "FL"},
    {"id": "EEE-22", "name": "EEE-22", "department": "EEE", "batch": "22", "size": 52, "home_building_id": "FL"},
    {"id": "EEE-23", "name": "EEE-23", "department": "EEE", "batch": "23", "size": 46, "home_building_id": "FL"},
    {"id": "BBA-21", "name": "BBA-21", "department": "BBA", "batch": "21", "size": 64, "home_building_id": "FL"},
    {"id": "BBA-22", "name": "BBA-22", "department": "BBA", "batch": "22", "size": 58, "home_building_id": "FL"},
    {"id": "BBA-23", "name": "BBA-23", "department": "BBA", "batch": "23", "size": 48, "home_building_id": "FL"},
    {"id": "BIO-21", "name": "BIO-21", "department": "BIO", "batch": "21", "size": 52, "home_building_id": "AD"},
    {"id": "BIO-22", "name": "BIO-22", "department": "BIO", "batch": "22", "size": 40, "home_building_id": "AD"},
    {"id": "BIO-23", "name": "BIO-23", "department": "BIO", "batch": "23", "size": 44, "home_building_id": "AD"},
    {"id": "ME-21", "name": "ME-21", "department": "ME", "batch": "21", "size": 46, "home_building_id": "TS"},
    {"id": "ME-22", "name": "ME-22", "department": "ME", "batch": "22", "size": 50, "home_building_id": "TS"},
    {"id": "ME-23", "name": "ME-23", "department": "ME", "batch": "23", "size": 42, "home_building_id": "TS"},
    {"id": "ARC-21", "name": "ARC-21", "department": "ARCH", "batch": "21", "size": 38, "home_building_id": "TS"},
    {"id": "ARC-22", "name": "ARC-22", "department": "ARCH", "batch": "22", "size": 42, "home_building_id": "TS"},
    {"id": "CIV-21", "name": "CIV-21", "department": "CIV", "batch": "21", "size": 44, "home_building_id": "TS"},
    {"id": "CIV-22", "name": "CIV-22", "department": "CIV", "batch": "22", "size": 40, "home_building_id": "TS"},
    {"id": "MAT-21", "name": "MAT-21", "department": "MATH", "batch": "21", "size": 36, "home_building_id": "AD"},
    {"id": "MAT-22", "name": "MAT-22", "department": "MATH", "batch": "22", "size": 34, "home_building_id": "AD"},
]

COURSES = [
    {"id": "CS-301", "code": "CS-301", "title": "Algorithms & Complexity", "department": "CSE", "teacher_id": "T-01", "weekly_sessions": 1, "length": 1, "needs_lab": None, "required_equipment": [], "color": "#38D9F5"},
    {"id": "CS-302", "code": "CS-302", "title": "Database Systems", "department": "CSE", "teacher_id": "T-02", "weekly_sessions": 1, "length": 1, "needs_lab": None, "required_equipment": [], "color": "#4F8CFF"},
    {"id": "CS-305", "code": "CS-305", "title": "Operating Systems", "department": "CSE", "teacher_id": "T-03", "weekly_sessions": 1, "length": 1, "needs_lab": None, "required_equipment": [], "color": "#8B7CFF"},
    {"id": "CS-401", "code": "CS-401", "title": "Distributed Systems", "department": "CSE", "teacher_id": "T-04", "weekly_sessions": 1, "length": 1, "needs_lab": None, "required_equipment": [], "color": "#38D9F5"},
    {"id": "CS-402", "code": "CS-402", "title": "Advanced Networking Lab", "department": "CSE", "teacher_id": "T-25", "weekly_sessions": 1, "length": 2, "needs_lab": "networks", "required_equipment": ["networking"], "color": "#F5B84B"},
    {"id": "CS-405", "code": "CS-405", "title": "Machine Learning", "department": "CSE", "teacher_id": "T-05", "weekly_sessions": 1, "length": 1, "needs_lab": "computer", "required_equipment": ["gpu"], "color": "#4F8CFF"},
    {"id": "DS-201", "code": "DS-201", "title": "Data Engineering", "department": "DS", "teacher_id": "T-06", "weekly_sessions": 1, "length": 1, "needs_lab": None, "required_equipment": [], "color": "#35D39A"},
    {"id": "DS-310", "code": "DS-310", "title": "Visual Analytics", "department": "DS", "teacher_id": "T-26", "weekly_sessions": 1, "length": 1, "needs_lab": None, "required_equipment": [], "color": "#35D39A"},
    {"id": "EE-201", "code": "EE-201", "title": "Circuit Theory", "department": "EEE", "teacher_id": "T-07", "weekly_sessions": 2, "length": 1, "needs_lab": None, "required_equipment": [], "color": "#38D9F5"},
    {"id": "EE-305", "code": "EE-305", "title": "Power Systems", "department": "EEE", "teacher_id": "T-08", "weekly_sessions": 1, "length": 1, "needs_lab": None, "required_equipment": [], "color": "#4F8CFF"},
    {"id": "EE-L210", "code": "EE-L210", "title": "Embedded Systems Lab", "department": "EEE", "teacher_id": "T-09", "weekly_sessions": 1, "length": 2, "needs_lab": "electronics", "required_equipment": ["embedded"], "color": "#F5B84B"},
    {"id": "BA-201", "code": "BA-201", "title": "Principles of Management", "department": "BBA", "teacher_id": "T-10", "weekly_sessions": 2, "length": 1, "needs_lab": None, "required_equipment": [], "color": "#8B7CFF"},
    {"id": "BA-305", "code": "BA-305", "title": "Operations Management", "department": "BBA", "teacher_id": "T-11", "weekly_sessions": 1, "length": 1, "needs_lab": None, "required_equipment": [], "color": "#8B7CFF"},
    {"id": "BA-410", "code": "BA-410", "title": "Strategic Finance", "department": "BBA", "teacher_id": "T-12", "weekly_sessions": 1, "length": 1, "needs_lab": None, "required_equipment": [], "color": "#4F8CFF"},
    {"id": "BIO-201", "code": "BIO-201", "title": "Cell Biology", "department": "BIO", "teacher_id": "T-13", "weekly_sessions": 2, "length": 1, "needs_lab": None, "required_equipment": [], "color": "#35D39A"},
    {"id": "BIO-L205", "code": "BIO-L205", "title": "Biochemistry Lab", "department": "BIO", "teacher_id": "T-14", "weekly_sessions": 1, "length": 2, "needs_lab": "biology", "required_equipment": ["fumehood"], "color": "#F5B84B"},
    {"id": "BIO-310", "code": "BIO-310", "title": "Genetics", "department": "BIO", "teacher_id": "T-15", "weekly_sessions": 1, "length": 1, "needs_lab": None, "required_equipment": [], "color": "#35D39A"},
    {"id": "ME-201", "code": "ME-201", "title": "Thermodynamics", "department": "ME", "teacher_id": "T-16", "weekly_sessions": 2, "length": 1, "needs_lab": None, "required_equipment": [], "color": "#38D9F5"},
    {"id": "ME-305", "code": "ME-305", "title": "Manufacturing Processes", "department": "ME", "teacher_id": "T-17", "weekly_sessions": 1, "length": 1, "needs_lab": None, "required_equipment": [], "color": "#4F8CFF"},
    {"id": "ME-L210", "code": "ME-L210", "title": "Robotics Lab", "department": "ME", "teacher_id": "T-18", "weekly_sessions": 1, "length": 2, "needs_lab": "robotics", "required_equipment": ["robotics"], "color": "#F5B84B"},
    {"id": "AR-201", "code": "AR-201", "title": "Architectural Design Studio", "department": "ARCH", "teacher_id": "T-19", "weekly_sessions": 2, "length": 1, "needs_lab": None, "required_equipment": [], "color": "#8B7CFF"},
    {"id": "AR-305", "code": "AR-305", "title": "Urban Systems", "department": "ARCH", "teacher_id": "T-20", "weekly_sessions": 1, "length": 1, "needs_lab": None, "required_equipment": [], "color": "#35D39A"},
    {"id": "CE-201", "code": "CE-201", "title": "Structural Analysis", "department": "CIV", "teacher_id": "T-21", "weekly_sessions": 2, "length": 1, "needs_lab": None, "required_equipment": [], "color": "#4F8CFF"},
    {"id": "CE-310", "code": "CE-310", "title": "Geotechnical Engineering", "department": "CIV", "teacher_id": "T-22", "weekly_sessions": 1, "length": 1, "needs_lab": None, "required_equipment": [], "color": "#35D39A"},
    {"id": "MA-201", "code": "MA-201", "title": "Linear Algebra", "department": "MATH", "teacher_id": "T-23", "weekly_sessions": 1, "length": 1, "needs_lab": None, "required_equipment": [], "color": "#8B7CFF"},
    {"id": "MA-305", "code": "MA-305", "title": "Probability & Statistics", "department": "MATH", "teacher_id": "T-24", "weekly_sessions": 1, "length": 1, "needs_lab": None, "required_equipment": [], "color": "#8B7CFF"},
]

GROUP_COURSES = {
    "CSE-21": ["CS-301", "CS-302", "CS-402"],
    "CSE-22": ["CS-301", "CS-302", "CS-402"],
    "CSE-23": ["CS-301", "CS-305", "CS-405"],
    "CSE-24": ["CS-301", "CS-305", "CS-405"],
    "DS-21": ["DS-201", "DS-310", "CS-401"],
    "DS-22": ["DS-201", "DS-310", "CS-401"],
    "EEE-21": ["EE-201", "EE-305", "EE-L210"],
    "EEE-22": ["EE-201", "EE-305", "EE-L210"],
    "EEE-23": ["EE-201", "EE-305", "EE-L210"],
    "BBA-21": ["BA-201", "BA-305", "BA-410"],
    "BBA-22": ["BA-201", "BA-305", "BA-410"],
    "BBA-23": ["BA-201", "BA-305", "BA-410"],
    "BIO-21": ["BIO-201", "BIO-L205", "BIO-310"],
    "BIO-22": ["BIO-201", "BIO-L205", "BIO-310"],
    "BIO-23": ["BIO-201", "BIO-L205", "BIO-310"],
    "ME-21": ["ME-201", "ME-305", "ME-L210"],
    "ME-22": ["ME-201", "ME-305", "ME-L210"],
    "ME-23": ["ME-201", "ME-305", "ME-L210"],
    "ARC-21": ["AR-201", "AR-305", "MA-305"],
    "ARC-22": ["AR-201", "AR-305", "MA-305"],
    "CIV-21": ["CE-201", "CE-310", "MA-201"],
    "CIV-22": ["CE-201", "CE-310", "MA-201"],
    "MAT-21": ["MA-201", "MA-305", "CS-301"],
    "MAT-22": ["MA-201", "MA-305", "CS-301"],
}

# Four weekly sessions per group where the catalogue allows it: add a shared
# fourth course to groups that only map to three to keep the workload realistic.
FOURTH_COURSE = {
    "CSE-21": "CS-305",
    "CSE-22": "CS-305",
    "CSE-23": "CS-302",
    "CSE-24": "CS-302",
    "DS-21": "CS-405",
    "DS-22": "CS-405",
    "EEE-21": "MA-201",
    "EEE-22": "MA-201",
    "EEE-23": "MA-201",
    "BBA-21": "MA-305",
    "BBA-22": "MA-305",
    "BBA-23": "MA-305",
    "BIO-21": "MA-305",
    "BIO-22": "MA-305",
    "BIO-23": "MA-305",
    "ME-21": "EE-305",
    "ME-22": "EE-305",
    "ME-23": "EE-305",
    "ARC-21": "BA-305",
    "ARC-22": "BA-305",
    "CIV-21": "BA-305",
    "CIV-22": "BA-305",
    "MAT-21": "DS-310",
    "MAT-22": "DS-310",
}
for _group, _extra in FOURTH_COURSE.items():
    GROUP_COURSES[_group] = GROUP_COURSES[_group] + [_extra]

BUILDING_INDEX = {b["id"]: b for b in BUILDINGS}
ROOM_INDEX = {r["id"]: r for r in ROOMS}
TEACHER_INDEX = {t["id"]: t for t in TEACHERS}
GROUP_INDEX = {g["id"]: g for g in GROUPS}
COURSE_INDEX = {c["id"]: c for c in COURSES}

for _room in ROOMS:
    _room["building_name"] = BUILDING_INDEX[_room["building_id"]]["name"]


def travel_distance(a_building: str, b_building: str) -> int:
    """Simplified building-to-building walking distance in metres."""
    return DISTANCES.get(a_building, {}).get(b_building, 0)
