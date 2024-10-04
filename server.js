const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');
const https = require('https');

const app = express();
const port = process.env.PORT || 3000;

// PostgreSQL connection pool
const pool = new Pool({
    connectionString: 'postgresql://pythonclassusers_user:1BechQrNt7syVlWvVxWR0GzKZmUSjGUo@dpg-crvnn7pu0jms73dr0k2g-a.frankfurt-postgres.render.com/pythonclassusers',
    ssl: {
        rejectUnauthorized: false
    }
});

async function initializeDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE,
                password TEXT,
                role TEXT
            );

            CREATE TABLE IF NOT EXISTS classes (
                id SERIAL PRIMARY KEY,
                name TEXT,
                code TEXT UNIQUE,
                teacher_id INTEGER REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS class_members (
                class_id INTEGER REFERENCES classes(id),
                user_id INTEGER REFERENCES users(id),
                UNIQUE(class_id, user_id)
            );

            CREATE TABLE IF NOT EXISTS projects (
                id SERIAL PRIMARY KEY,
                name TEXT,
                code TEXT,
                user_id INTEGER REFERENCES users(id)
            );
        `);
        console.log('Database initialized successfully');
    } catch (err) {
        console.error('Error initializing database:', err);
    }
}

initializeDatabase();

app.use(express.static('public'));
app.use(express.json());

// Register endpoint (for students)
app.post('/api/register', async (req, res) => {
    console.log('Received registration request:', req.body);
    const { username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id',
            [username, hashedPassword, 'student']
        );
        console.log('User registered:', username);
        res.json({ message: 'User registered successfully', userId: result.rows[0].id });
    } catch (error) {
        if (error.code === '23505') { // unique_violation
            return res.status(400).json({ error: 'Account already exists. Try logging in.' });
        }
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Register teacher endpoint
app.post('/api/register/teacher', async (req, res) => {
    console.log('Received teacher registration request:', req.body);
    const { username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id',
            [username, hashedPassword, 'teacher']
        );
        console.log('Teacher registered:', username);
        res.json({ 
            message: 'Teacher registered successfully', 
            userId: result.rows[0].id, 
            greeting: `Welcome, ${username}! You can now create classes.` 
        });
    } catch (error) {
        if (error.code === '23505') { // unique_violation
            return res.status(400).json({ error: 'Account already exists. Try logging in.' });
        }
        console.error('Teacher registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    console.log('Received login request:', req.body);
    const { username, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const match = await bcrypt.compare(password, user.password);
            if (match) {
                console.log('User logged in:', username);
                res.json({ message: 'Login successful', username: user.username, role: user.role, userId: user.id });
            } else {
                console.log('Login failed for:', username);
                res.status(401).json({ error: 'Invalid credentials' });
            }
        } else {
            console.log('Login failed for:', username);
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create class endpoint
app.post('/api/class', async (req, res) => {
    const { name, teacherId } = req.body;
    const code = Math.random().toString(36).substring(7);
    try {
        const result = await pool.query(
            'INSERT INTO classes (name, code, teacher_id) VALUES ($1, $2, $3) RETURNING id',
            [name, code, teacherId]
        );
        console.log('Class created:', name);
        res.json({ message: 'Class created successfully', classId: result.rows[0].id, code: code });
    } catch (error) {
        console.error('Class creation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get teacher's classes endpoint
app.get('/api/classes/:teacherId', async (req, res) => {
    const teacherId = req.params.teacherId;
    try {
        const result = await pool.query('SELECT * FROM classes WHERE teacher_id = $1', [teacherId]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching classes:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Join class endpoint
app.post('/api/join-class', async (req, res) => {
    const { username, classCode } = req.body;
    try {
        const classResult = await pool.query('SELECT id FROM classes WHERE code = $1', [classCode]);
        if (classResult.rows.length === 0) {
            return res.status(404).json({ error: 'Class not found' });
        }
        const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        await pool.query(
            'INSERT INTO class_members (class_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [classResult.rows[0].id, userResult.rows[0].id]
        );
        res.json({ message: 'Successfully joined the class' });
    } catch (error) {
        console.error('Error joining class:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user's classes endpoint
app.get('/api/user-classes/:username', async (req, res) => {
    const username = req.params.username;
    try {
        const result = await pool.query(`
            SELECT classes.id, classes.name
            FROM classes
            JOIN class_members ON classes.id = class_members.class_id
            JOIN users ON users.id = class_members.user_id
            WHERE users.username = $1
        `, [username]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching user classes:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get class members endpoint
app.get('/api/class/:classId/members', async (req, res) => {
    const classId = req.params.classId;
    try {
        const result = await pool.query(`
            SELECT users.id, users.username
            FROM users
            JOIN class_members ON users.id = class_members.user_id
            WHERE class_members.class_id = $1
        `, [classId]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching class members:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get student projects endpoint
app.get('/api/student/:studentId/projects', async (req, res) => {
    const studentId = req.params.studentId;
    try {
        const result = await pool.query('SELECT id, name, code FROM projects WHERE user_id = $1', [studentId]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching student projects:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Save project endpoint
app.post('/api/project', async (req, res) => {
    const { name, code, userId } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO projects (name, code, user_id) VALUES ($1, $2, $3) RETURNING id',
            [name, code, userId]
        );
        console.log('Project saved:', name);
        res.json({ message: 'Project saved successfully', projectId: result.rows[0].id });
    } catch (error) {
        console.error('Project saving error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user's projects endpoint
app.get('/api/user-projects/:userId', async (req, res) => {
    const userId = req.params.userId;
    try {
        const result = await pool.query('SELECT id, name, code FROM projects WHERE user_id = $1', [userId]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching user projects:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete user's own account endpoint
app.delete('/api/user', async (req, res) => {
    const { username, password } = req.body;
    try {
        const userResult = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            const match = await bcrypt.compare(password, user.password);
            if (match) {
                await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
                console.log('User account deleted:', username);
                res.json({ message: 'Account deleted successfully' });
            } else {
                res.status(401).json({ error: 'Invalid credentials' });
            }
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all users endpoint (for admin page)
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, role FROM users');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin delete user endpoint
app.delete('/api/user/:userId', async (req, res) => {
    const { username, password } = req.body;
    const userIdToDelete = req.params.userId;
    if (username !== 'Parrepro' || password !== 'goodboy@123') {
        return res.status(401).json({ error: 'Invalid admin credentials' });
    }
    try {
        const result = await pool.query('DELETE FROM users WHERE id = $1', [userIdToDelete]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        console.log('User account deleted by admin:', userIdToDelete);
        res.json({ message: 'Account deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all classes endpoint (for admin page)
app.get('/api/classes', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM classes');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching classes:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Admin delete class endpoint
app.delete('/api/class/:classId', async (req, res) => {
    const { username, password } = req.body;
    const classIdToDelete = req.params.classId;
    if (username !== 'Parrepro' || password !== 'goodboy@123') {
        return res.status(401).json({ error: 'Invalid admin credentials' });
    }
    try {
        const result = await pool.query('DELETE FROM classes WHERE id = $1', [classIdToDelete]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Class not found' });
        }
        console.log('Class deleted by admin:', classIdToDelete);
        res.json({ message: 'Class deleted successfully' });
    } catch (error) {
        console.error('Error deleting class:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Keep-alive endpoint
app.get('/keep-alive', (req, res) => {
    res.send('Server is alive');
});

// Keep-alive function
function keepAlive() {
    setInterval(() => {
        https.get(`https://${process.env.RENDER_EXTERNAL_HOSTNAME}`, (resp) => {
            if (resp.statusCode === 200) {
                console.log('Server kept alive');
            } else {
                console.log('Server ping failed');
            }
        }).on('error', (err) => {
            console.log('Error: ', err.message);
        });
    }, 14 * 60 * 1000); // Ping every 14 minutes
}

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    keepAlive();
});