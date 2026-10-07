const db = require('../db');

async function main() {
  const connection = await db.getConnection();
  let created = 0;
  let aligned = 0;
  try {
    await connection.beginTransaction();
    const [admins] = await connection.query('SELECT id, email, name FROM users WHERE role = ? ORDER BY id FOR UPDATE', ['Admin']);
    for (const admin of admins) {
      const [profiles] = await connection.query('SELECT emp_id, email, name FROM employees WHERE user_id = ? FOR UPDATE', [admin.id]);
      const profile = profiles[0];
      if (!profile) {
        const empId = `ADMIN-${admin.id}`;
        const [conflicts] = await connection.query('SELECT emp_id FROM employees WHERE emp_id = ? OR email = ? LIMIT 1', [empId, admin.email]);
        if (conflicts.length) throw new Error(`Cannot link Admin user ${admin.id}: employee ID or email already belongs to another profile.`);
        await connection.query(
          `INSERT INTO employees (emp_id, user_id, name, department, position, role, email, salary, leave_balance, status, employment_status)
           VALUES (?, ?, ?, 'Administration', 'System Administrator', 'Admin', ?, 0, 0, 'Active', 'Active')`,
          [empId, admin.id, admin.name || 'System Administrator', admin.email]
        );
        created += 1;
      } else if (profile.email !== admin.email || profile.name !== admin.name) {
        const [conflicts] = await connection.query('SELECT emp_id FROM employees WHERE email = ? AND emp_id <> ? LIMIT 1', [admin.email, profile.emp_id]);
        if (conflicts.length) throw new Error(`Cannot align Admin user ${admin.id}: email is already in another profile.`);
        await connection.query('UPDATE employees SET email = ? WHERE emp_id = ?', [admin.email, profile.emp_id]);
        await connection.query('UPDATE users SET name = ? WHERE id = ?', [profile.name, admin.id]);
        aligned += 1;
      }
    }
    await connection.commit();
    console.log(`Admin profiles linked: ${created} created, ${aligned} aligned.`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
