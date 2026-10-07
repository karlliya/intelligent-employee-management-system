const db = require('../backend/db');
const { hashPassword } = require('../backend/security');

const users = [
  { email: 'admin@iems.local', name: 'Aina Rahman', role: 'Admin', emp_id: 'EMP001', department: 'Administration', position: 'IEMS System Administrator', salary: 9800, phone: '012-3001001', skills: 'Security,Compliance,HRIS', experience: 8, project: 'Corporate Digital HR Rollout', site: 'HQ Kuala Lumpur', cert: 'ISO 27001 Awareness' },
  { email: 'employee.sofia@iems.local', name: 'Sofia Tan', role: 'Employee', emp_id: 'EMP006', department: 'Electrical Engineering', position: 'Electrical Engineer', salary: 5600, phone: '012-3001006', skills: 'LV Systems,Testing,Power Distribution', experience: 3, project: 'Data Centre LV Upgrade', site: 'Cyberjaya DC', cert: 'Chargeman A4' },
  { email: 'employee.hakim@iems.local', name: 'Hakim Yusuf', role: 'Employee', emp_id: 'EMP007', department: 'Mechanical Engineering', position: 'Mechanical Engineer', salary: 6100, phone: '012-3001007', skills: 'HVAC,Plant Maintenance,Commissioning', experience: 4, project: 'Hospital HVAC Retrofit', site: 'Seremban Hospital', cert: 'CIDB Green Card' },
  { email: 'employee.mei@iems.local', name: 'Mei Ling', role: 'Employee', emp_id: 'EMP008', department: 'Safety & QA/QC', position: 'QA/QC Engineer', salary: 5800, phone: '012-3001008', skills: 'Inspection,ITP,NCR,Documentation', experience: 5, project: 'Johor Industrial Plant Expansion', site: 'Pasir Gudang Site', cert: 'ISO 9001 Internal Auditor' },
];

const departments = [
  ['Civil Engineering', 'CIV', 'Civil and structural engineering'],
  ['Mechanical Engineering', 'MEC', 'Mechanical systems and plant engineering'],
  ['Electrical Engineering', 'ELE', 'Electrical, instrumentation, and controls'],
  ['Project Management', 'PMO', 'Engineering project planning and delivery'],
  ['Safety & QA/QC', 'SQA', 'Site safety, quality assurance, and quality control'],
  ['Administration', 'ADM', 'Corporate administration and HR']
];

function dateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function seed() {
  const passwordHash = await hashPassword('Admin123456!');

  for (const [name, code, description] of departments) {
    await db.query(
      `INSERT INTO departments (name, code, description)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE code = VALUES(code), description = VALUES(description)`,
      [name, code, description]
    );
  }

  for (const person of users) {
    const [userResult] = await db.query(
      `INSERT INTO users (email, password, role, email_verified, email_verified_at, name, initials, color)
       VALUES (?, ?, ?, 1, NOW(), ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [person.email, passwordHash, person.role, person.name, person.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(), '#E6007A']
    );
    const userId = userResult.insertId;
    const [deptRows] = await db.query('SELECT id FROM departments WHERE name = ?', [person.department]);
    const departmentId = deptRows[0]?.id || null;
    await db.query(
      `INSERT INTO employees (emp_id, user_id, name, department, department_id, position, role, email, phone, status, joined_date, salary, leave_balance, skills, experience_duration, years_experience, project_assigned, site_location, certification, employment_status, engagement_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?)
       ON DUPLICATE KEY UPDATE emp_id = emp_id`,
      [person.emp_id, userId, person.name, person.department, departmentId, person.position, person.role, person.email, person.phone, dateOffset(-365 - person.experience * 120), person.salary, 18 - (person.emp_id.endsWith('8') ? 12 : 0), person.skills, person.experience, person.experience, person.project, person.site, person.cert, person.emp_id.endsWith('9') ? 5 : 8]
    );
  }

  const attendanceDays = [-4, -3, -2, -1, 0];
  for (const person of users) {
    for (const day of attendanceDays) {
      const late = person.emp_id === 'EMP007' && day !== -2;
      const checkIn = late ? '09:45:00' : '08:45:00';
      const checkOut = '18:00:00';
      await db.query(
        `INSERT INTO attendance (emp_id, date, check_in, check_out, working_hours, status, method)
         VALUES (?, ?, ?, ?, ?, ?, 'Web')
         ON DUPLICATE KEY UPDATE emp_id = emp_id`,
        [person.emp_id, dateOffset(day), checkIn, checkOut, late ? 8.25 : 9.25, late ? 'Late' : 'Present']
      );
    }
  }

  const leaves = [
    ['EMP006', 'Annual', 6, 7, 'Family event', 'Pending', 0],
    ['EMP008', 'Sick', -1, -1, 'Medical appointment', 'Approved', 0]
  ];
  for (const [empId, type, fromOffset, toOffset, reason, status, conflict] of leaves) {
    const [existing] = await db.query('SELECT id FROM leaves WHERE emp_id = ? AND type = ? AND from_date = ? AND to_date = ? LIMIT 1', [empId, type, dateOffset(fromOffset), dateOffset(toOffset)]);
    if (existing.length) continue;
    await db.query(
      `INSERT INTO leaves (emp_id, type, from_date, to_date, days, reason, status, conflict_warning)
       VALUES (?, ?, ?, ?, DATEDIFF(?, ?) + 1, ?, ?, ?)`,
      [empId, type, dateOffset(fromOffset), dateOffset(toOffset), dateOffset(toOffset), dateOffset(fromOffset), reason, status, conflict]
    );
  }

  const scores = {
    EMP001: [94, 92, 96],
    EMP006: [83, 87, 92],
    EMP007: [78, 82, 66],
    EMP008: [69, 72, 88]
  };
  const months = [new Date().toISOString().slice(0, 7)];
  for (const [empId, [kpi, task, attendance]] of Object.entries(scores)) {
    const finalScore = Math.round(((kpi * 0.4) + (task * 0.35) + (attendance * 0.25)) * 100) / 100;
    const rating = finalScore >= 85 ? 'Excellent' : finalScore >= 70 ? 'Good' : finalScore >= 50 ? 'Average' : 'Needs Improvement';
    await db.query(
      `INSERT INTO performance (emp_id, review_month, kpi_score, task_completion_score, attendance_score, final_score, rating, hr_alert)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE emp_id = emp_id`,
      [empId, months[0], kpi, task, attendance, finalScore, rating, 0]
    );
  }

  console.log('Seed complete: 1 Admin and 3 Employee sample accounts added. Existing records were kept.');
  await db.end();
}

seed().catch(async (error) => {
  console.error(error);
  await db.end();
  process.exit(1);
});
