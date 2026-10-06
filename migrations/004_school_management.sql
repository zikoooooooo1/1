INSERT INTO roles(id) VALUES ('school_management');
INSERT INTO permissions(id,description) VALUES ('academic.manage','Manage academic structure and school operations'),('system.manage','Manage system settings and health'),('roles.manage','Assign account roles'),('academic.audit','Read academic activity');
UPDATE permissions SET description='Manage school identity and localization' WHERE id='school.manage';
INSERT INTO role_permissions(role_id,permission_id) VALUES
('admin','academic.manage'),('admin','system.manage'),('admin','roles.manage'),('admin','academic.audit'),
('school_management','academic.manage'),('school_management','class.manage'),('school_management','academic.audit');
