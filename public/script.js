let editor;
let currentUser = null;
let inputBuffer = [];
let inputResolve = null;

document.addEventListener('DOMContentLoaded', () => {
    editor = CodeMirror.fromTextArea(document.getElementById("code"), {
        mode: "python",
        theme: "monokai",
        lineNumbers: true
    });

    // Check if user is already logged in
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
        updateUIForLoggedInUser();
    }

    // Event listeners
    document.getElementById('login-button').addEventListener('click', () => showModal('login-modal'));
    document.getElementById('register-button').addEventListener('click', () => showModal('register-modal'));
    document.getElementById('logout-button').addEventListener('click', logout);
    document.getElementById('delete-account-button').addEventListener('click', () => showModal('delete-account-modal'));
    document.getElementById('join-class-button').addEventListener('click', () => showModal('join-class-modal'));
    document.getElementById('run-button').addEventListener('click', runCode);
    document.getElementById('save-button').addEventListener('click', () => showModal('save-project-modal'));
    document.getElementById('my-projects-button').addEventListener('click', loadProjects);
    document.getElementById('start-new-button').addEventListener('click', startNewCode);

    document.getElementById('login-submit').addEventListener('click', login);
    document.getElementById('register-submit').addEventListener('click', register);
    document.getElementById('delete-account-submit').addEventListener('click', deleteAccount);
    document.getElementById('join-class-submit').addEventListener('click', joinClass);
    document.getElementById('submit-input').addEventListener('click', submitInput);
    document.getElementById('submit-save-project').addEventListener('click', saveProject);
    document.getElementById('override-project').addEventListener('click', showOverrideProjectModal);
    document.getElementById('confirm-override').addEventListener('click', overrideProject);

    // Close buttons for modals
    document.querySelectorAll('.close').forEach(button => {
        button.addEventListener('click', () => {
            button.closest('.modal').style.display = 'none';
        });
    });
});

function showMessage(message, isError = false) {
    const messageContainer = document.getElementById('message-container');
    messageContainer.textContent = message;
    messageContainer.className = `message ${isError ? 'error' : 'success'}`;
    messageContainer.style.display = 'block';
    setTimeout(() => {
        messageContainer.style.display = 'none';
    }, 5000);
}

function showModal(modalId) {
    document.getElementById(modalId).style.display = 'block';
}

function hideModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

async function login() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            throw new Error('Login failed');
        }

        const data = await response.json();
        currentUser = { username: data.username, userId: data.userId, role: data.role };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        updateUIForLoggedInUser();
        hideModal('login-modal');
        showMessage(`Welcome back, ${currentUser.username}!`);
    } catch (error) {
        showMessage('Login failed. Please try again.', true);
    }
}

async function register() {
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            throw new Error('Registration failed');
        }

        hideModal('register-modal');
        showMessage('Account created successfully. Please log in.');
    } catch (error) {
        showMessage('Registration failed. Please try again.', true);
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    updateUIForLoggedOutUser();
    showMessage('You have been logged out.');
}

async function deleteAccount() {
    const password = document.getElementById('delete-account-password').value;

    try {
        const response = await fetch('/api/user', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser.username, password })
        });

        if (!response.ok) {
            throw new Error('Account deletion failed');
        }

        logout();
        hideModal('delete-account-modal');
        showMessage('Your account has been deleted.');
    } catch (error) {
        showMessage('Account deletion failed. Please try again.', true);
    }
}

async function joinClass() {
    const classCode = document.getElementById('class-code').value;

    try {
        const response = await fetch('/api/join-class', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser.username, classCode })
        });

        if (!response.ok) {
            throw new Error('Joining class failed');
        }

        hideModal('join-class-modal');
        showMessage('Successfully joined the class');
        loadUserClasses();
    } catch (error) {
        showMessage('Joining class failed. Please try again.', true);
    }
}

function runCode() {
    const code = editor.getValue();
    const outputElement = document.getElementById("output");
    outputElement.innerHTML = '';
    inputBuffer = [];
    
    function outf(text) {
        if (text.startsWith('(') && text.endsWith(')')) {
            // This is likely a tuple from a print statement
            const parts = text.slice(1, -1).split(',').map(part => part.trim());
            outputElement.innerHTML += parts.join(' ') + '\n';
        } else {
            outputElement.innerHTML += text;
        }
    }

    function builtinRead(x) {
        if (Sk.builtinFiles === undefined || Sk.builtinFiles["files"][x] === undefined)
            throw "File not found: '" + x + "'";
        return Sk.builtinFiles["files"][x];
    }

    Sk.configure({
        output: outf,
        read: builtinRead,
        inputfun: inputHandler,
        inputfunTakesPrompt: true,
        __future__: Sk.python3
    });

    Sk.misceval.asyncToPromise(() => {
        return Sk.importMainWithBody("<stdin>", false, code, true);
    }).then(
        function (mod) {
            console.log('Code execution successful');
        },
        function (err) {
            console.log(err.toString());
            outputElement.innerHTML += '<span style="color: red;">' + err.toString() + '</span>';
        }
    );
}

function inputHandler(prompt) {
    return new Promise((resolve) => {
        const outputElement = document.getElementById("output");
        outputElement.innerHTML += prompt;
        
        const inputArea = document.getElementById("input-area");
        const inputBox = document.getElementById("input-box");
        
        inputArea.style.display = 'block';
        inputBox.focus();
        
        inputResolve = resolve;
    });
}

function submitInput() {
    const inputBox = document.getElementById("input-box");
    const input = inputBox.value;
    inputBox.value = '';
    
    const outputElement = document.getElementById("output");
    outputElement.innerHTML += input + '\n';
    
    document.getElementById("input-area").style.display = 'none';
    
    if (inputResolve) {
        inputResolve(input);
        inputResolve = null;
    }
}

async function saveProject() {
    const projectName = document.getElementById('project-name').value.trim();
    if (!projectName) {
        showMessage('Please enter a project name', true);
        return;
    }

    const code = editor.getValue();

    try {
        const response = await fetch('/api/project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: projectName, code, userId: currentUser.userId })
        });

        if (!response.ok) {
            throw new Error('Saving project failed');
        }

        showMessage('Project saved successfully');
        hideModal('save-project-modal');
        document.getElementById('project-name').value = '';
    } catch (error) {
        showMessage('Saving project failed. Please try again.', true);
    }
}

function showOverrideProjectModal() {
    loadProjectsForOverride();
    showModal('override-project-modal');
}

async function loadProjectsForOverride() {
    try {
        const response = await fetch(`/api/user-projects/${currentUser.userId}`);
        if (!response.ok) {
            throw new Error('Loading projects failed');
        }
        const projects = await response.json();

        const projectSelect = document.getElementById('project-select');
        projectSelect.innerHTML = '';

        projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = project.name;
            projectSelect.appendChild(option);
        });
    } catch (error) {
        showMessage('Loading projects failed. Please try again.', true);
    }
}

async function overrideProject() {
    const projectId = document.getElementById('project-select').value;
    const newProjectName = document.getElementById('new-project-name').value.trim();
    const code = editor.getValue();

    try {
        const response = await fetch(`/api/project/${projectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newProjectName || undefined, code, userId: currentUser.userId })
        });

        if (!response.ok) {
            throw new Error('Overriding project failed');
        }

        showMessage('Project overridden successfully');
        hideModal('override-project-modal');
        document.getElementById('new-project-name').value = '';
    } catch (error) {
        showMessage('Overriding project failed. Please try again.', true);
    }
}

async function loadProjects() {
    if (!currentUser) {
        showMessage('Please log in to view your projects', true);
        return;
    }

    try {
        const response = await fetch(`/api/user-projects/${currentUser.userId}`);
        if (!response.ok) {
            throw new Error('Loading projects failed');
        }
        const projects = await response.json();

        const projectsList = document.getElementById('projects-list');
        projectsList.innerHTML = '';

        projects.forEach(project => {
            const li = document.createElement('li');
            li.textContent = project.name;
            
            const loadButton = document.createElement('button');
            loadButton.textContent = 'Load';
            loadButton.addEventListener('click', () => loadProjectInEditor(project));
            
            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Delete';
            deleteButton.addEventListener('click', () => deleteProject(project.id));
            
            li.appendChild(loadButton);
            li.appendChild(deleteButton);
            projectsList.appendChild(li);
        });

        showModal('my-projects-modal');
    } catch (error) {
        showMessage('Loading projects failed. Please try again.', true);
    }
}

function loadProjectInEditor(project) {
    editor.setValue(project.code);
    hideModal('my-projects-modal');
    showMessage(`Project "${project.name}" loaded`);
}

async function deleteProject(projectId) {
    if (confirm('Are you sure you want to delete this project?')) {
        try {
            const response = await fetch(`/api/project/${projectId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUser.userId })
            });

            if (!response.ok) {
                throw new Error('Deleting project failed');
            }

            showMessage('Project deleted successfully');
            loadProjects();
        } catch (error) {
            showMessage('Deleting project failed. Please try again.', true);
        }
    }
}

function startNewCode() {
    if (confirm('Are you sure you want to start a new code? Any unsaved changes will be lost.')) {
        editor.setValue('');
        document.getElementById('output').innerHTML = '';
        showMessage('New code started');
    }
}

async function loadUserClasses() {
    if (!currentUser) {
        return;
    }

    try {
        const response = await fetch(`/api/user-classes/${currentUser.username}`);
        if (!response.ok) {
            throw new Error('Loading classes failed');
        }
        const classes = await response.json();

        const classesList = document.getElementById('classes-list');
        classesList.innerHTML = '';

        classes.forEach(classItem => {
            const li = document.createElement('li');
            li.textContent = classItem.name;
            classesList.appendChild(li);
        });

        document.getElementById('classes-container').style.display = 'block';
    } catch (error) {
        showMessage('Loading classes failed. Please try again.', true);
    }
}

function updateUIForLoggedInUser() {
    document.getElementById('welcome-message').textContent = `Welcome, ${currentUser.username}!`;
    document.getElementById('login-button').style.display = 'none';
    document.getElementById('register-button').style.display = 'none';
    document.getElementById('logout-button').style.display = 'inline-block';
    document.getElementById('delete-account-button').style.display = 'inline-block';
    document.getElementById('join-class-button').style.display = 'inline-block';
    document.getElementById('my-projects-button').style.display = 'inline-block';
    loadUserClasses();
}

function updateUIForLoggedOutUser() {
    document.getElementById('welcome-message').textContent = '';
    document.getElementById('login-button').style.display = 'inline-block';
    document.getElementById('register-button').style.display = 'inline-block';
    document.getElementById('logout-button').style.display = 'none';
    document.getElementById('delete-account-button').style.display = 'none';
    document.getElementById('join-class-button').style.display = 'none';
    document.getElementById('my-projects-button').style.display = 'none';
    document.getElementById('classes-container').style.display = 'none';
}