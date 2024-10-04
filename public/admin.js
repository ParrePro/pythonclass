async function fetchUsers() {
    try {
        const response = await fetch('/api/users');
        const { teachers, students } = await response.json();
        
        const teacherList = document.getElementById('teacher-list');
        teacherList.innerHTML = '';
        teachers.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.id}</td>
                <td>${user.username}</td>
                <td>${user.password}</td>
            `;
            teacherList.appendChild(row);
        });

        const studentList = document.getElementById('student-list');
        studentList.innerHTML = '';
        students.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.id}</td>
                <td>${user.username}</td>
                <td>${user.password}</td>
            `;
            studentList.appendChild(row);
        });
    } catch (error) {
        console.error('Error fetching users:', error);
    }
}

// Call fetchUsers when the page loads
window.onload = fetchUsers;