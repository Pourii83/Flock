// userId -> number of open sockets
const connections = new Map();

export function connect(userId) {
  const count = (connections.get(userId) || 0) + 1;
  connections.set(userId, count);
  return count === 1;
}

export function disconnect(userId) {
  const count = (connections.get(userId) || 1) - 1;
  if (count <= 0) {
    connections.delete(userId);
    return true;
  }
  connections.set(userId, count);
  return false;
}

export const isOnline = (userId) => connections.has(userId);
export const onlineCount = () => connections.size;
