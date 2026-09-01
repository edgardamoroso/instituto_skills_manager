import crypto from 'node:crypto';
import { hashPassword } from '../lib/password.js';
import { toCents } from '../lib/money.js';
import { config } from '../lib/config.js';

const initialCourses = [
  {
    id: 'gestao-equipes-resultados',
    title: 'Gestão de Equipes para Resultados',
    type: 'gravado',
    description: 'Aprenda práticas de liderança e gestão de performance com vídeos curtos e aplicáveis.',
    duration: '8 horas',
    price: 'R$ 79,00',
  },
  {
    id: 'comunicacao-vendas-consultivas',
    title: 'Comunicação e Vendas Consultivas',
    type: 'online',
    description: 'Participe de aulas ao vivo com exercícios e feedback prático.',
    duration: '6 semanas',
    price: 'R$ 149,00',
  },
  {
    id: 'marketing-digital-estrategico',
    title: 'Marketing Digital Estratégico',
    type: 'gravado',
    description: 'Estratégias para criar campanhas eficientes e mensurar resultados.',
    duration: '10 horas',
    price: 'R$ 99,00',
  },
  {
    id: 'lideranca-inteligencia-emocional',
    title: 'Liderança e Inteligência Emocional',
    type: 'online',
    description: 'Desenvolva habilidades de liderança com mentoria e dinâmica em grupo.',
    duration: '4 semanas',
    price: 'R$ 129,00',
  },
];

const ADMIN_EMAIL = config.adminEmail;
const ADMIN_PASSWORD = config.adminPassword;

export function seedDatabase(db) {
  const insertCourse = db.prepare(
    `INSERT INTO courses (id, title, type, description, duration, price_cents)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const course of initialCourses) {
    insertCourse.run(course.id, course.title, course.type, course.description, course.duration, toCents(course.price));
  }

  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, email_verified)
     VALUES (?, ?, ?, ?, 'admin', 1)`,
  ).run(crypto.randomUUID(), 'Administrador', ADMIN_EMAIL, hashPassword(ADMIN_PASSWORD));

  console.log('----------------------------------------------------------');
  console.log(' Banco criado e populado (SQLite).');
  console.log(` Admin......: ${ADMIN_EMAIL}`);
  if (!config.isProduction) {
    console.log(` Senha......: ${ADMIN_PASSWORD}`);
  }
  console.log(' Troque a senha após o primeiro acesso.');
  console.log('----------------------------------------------------------');
}
