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
