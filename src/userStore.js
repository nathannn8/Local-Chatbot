const USERS_KEY = 'local_chat_users';

function getUsers() {
  const raw = localStorage.getItem(USERS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function registerUser(username, password) {
  const users = getUsers();
  if (users.find((u) => u.username.toLowerCase() === username.toLowerCase())) {
    throw new Error('Username already exists');
  }
  users.push({ username, password });
  saveUsers(users);
  return { username };
}

export function authenticateUser(username, password) {
  const users = getUsers();
  const user = users.find(
    (u) => u.username.toLowerCase() === username.toLowerCase() && u.password === password
  );
  if (!user) throw new Error('Invalid username or password');
  return { username: user.username };
}
