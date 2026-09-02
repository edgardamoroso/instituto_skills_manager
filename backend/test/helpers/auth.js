// Helpers de autenticação para os testes de integração.

export async function loginAsAdmin(client) {
  const response = await client.post('/api/auth/login', {
    body: { email: 'admin@skills.local', password: 'admin123' },
  });
  if (response.status !== 200) {
    throw new Error(`login admin falhou: ${response.status} ${response.text}`);
  }
  return response.body.user;
}

// Extrai o token de um link em um e-mail da outbox (verify ou set_password).
export function tokenFromEmail(message) {
  const match = /[?&]token=([a-f0-9]+)/i.exec(message?.text || '');
  return match ? match[1] : null;
}

// Cria um autor via admin, consome o convite e devolve um client logado como esse autor.
export async function makeAuthorClient({ server, createClient, admin, sentMessages, clearOutbox, name = 'Autor' }) {
  clearOutbox();
  const email = `author-${Date.now()}-${Math.random().toString(36).slice(2)}@ex.com`;
  const created = await admin.post('/api/authors', { body: { name, email, bio: 'bio do autor' } });
  const token = tokenFromEmail(sentMessages[0]);
  const client = createClient(server.baseUrl);
  await client.post('/api/auth/set-password', { body: { token, password: 'senha-forte-1' } });
  return { client, id: created.body.id, email };
}
