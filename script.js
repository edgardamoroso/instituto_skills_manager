const STORAGE_KEY = 'skills-manager-courses-v1';

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

let courses = loadCourses().map((course) => ({ ...course, lessons: Array.isArray(course.lessons) ? course.lessons : [] }));
let editingId = null;
let managingCourseId = null;

const recordedContainer = document.getElementById('recorded-list');
const onlineContainer = document.getElementById('online-list');
const homeContainer = document.getElementById('home-courses');
const form = document.getElementById('course-form');
const formTitle = document.getElementById('form-title');
const courseIdInput = document.getElementById('course-id');
const cancelButton = document.getElementById('cancel-edit');
const adminList = document.getElementById('admin-course-list');
const courseCount = document.getElementById('course-count');
const lessonManager = document.getElementById('lesson-manager');
const lessonCourseTitle = document.getElementById('lesson-course-title');
const lessonForm = document.getElementById('lesson-form');
const lessonList = document.getElementById('lesson-list');
const lessonIdInput = document.getElementById('lesson-id');
const STUDENT_STORAGE_KEY = 'skills-manager-students-v1';
const studentForm = document.getElementById('student-form');
const enrollmentForm = document.getElementById('enrollment-form');

function loadCourses() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return initialCourses;
  }

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) && parsed.length
      ? parsed.map((course) => ({ ...course, lessons: Array.isArray(course.lessons) ? course.lessons : [] }))
      : initialCourses;
  } catch (error) {
    console.warn('Não foi possível carregar os cursos salvos.', error);
    return initialCourses;
  }
}

function saveCourses() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
}

function renderCourses() {
  const recorded = courses.filter((course) => course.type === 'gravado');
  const online = courses.filter((course) => course.type === 'online');
  const featured = [...courses].slice(0, 4);

  if (recordedContainer) {
    recordedContainer.innerHTML = recorded.length
      ? recorded.map(createCourseCard).join('')
      : '<p class="empty-state">Nenhum curso gravado cadastrado ainda.</p>';
  }

  if (onlineContainer) {
    onlineContainer.innerHTML = online.length
      ? online.map(createCourseCard).join('')
      : '<p class="empty-state">Nenhum curso online cadastrado ainda.</p>';
  }

  if (homeContainer) {
    homeContainer.innerHTML = featured.length
      ? featured.map(createCourseCard).join('')
      : '<p class="empty-state">Nenhum curso disponível ainda.</p>';
  }

  if (adminList) {
    renderAdminList();
  }
}

function createCourseCard(course) {
  return `
    <a class="card course-card" href="curso.html?id=${course.id}">
      <div class="card-head">
        <h3>${course.title}</h3>
        <span class="type-pill">${course.type === 'gravado' ? 'Gravado' : 'Online'}</span>
      </div>
      <p>${course.description}</p>
      <div class="meta">
        <span>⏱ ${course.duration}</span>
        <span>💸 ${course.price}</span>
      </div>
      <span class="card-link">Ver conteúdo do curso →</span>
    </a>
  `;
}

function renderAdminList() {
  if (courseCount) {
    courseCount.textContent = `${courses.length} cursos`;
  }

  if (!adminList) {
    return;
  }

  if (!courses.length) {
    adminList.innerHTML = '<p class="empty-state">Nenhum curso cadastrado.</p>';
    return;
  }

  adminList.innerHTML = courses
    .map(
      (course) => `
        <div class="admin-item">
          <div>
            <strong>${course.title}</strong>
            <p>${course.description}</p>
            <span class="badge">${course.type === 'gravado' ? 'Gravado' : 'Online'}</span>
            <span class="lesson-summary">${course.lessons.length} ${course.lessons.length === 1 ? 'aula cadastrada' : 'aulas cadastradas'}</span>
          </div>
          <div class="actions">
            <button class="action-btn edit" data-action="edit" data-id="${course.id}">Editar</button>
            <a class="action-btn lessons" href="gerenciar-curso.html?id=${course.id}">Gerenciar conteúdo</a>
            <button class="action-btn delete" data-action="delete" data-id="${course.id}">Excluir</button>
          </div>
        </div>
      `,
    )
    .join('');
}

function resetForm() {
  form.reset();
  courseIdInput.value = '';
  editingId = null;
  formTitle.textContent = 'Adicionar curso';
}

if (form) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const courseData = {
      id: editingId || crypto.randomUUID(),
      title: formData.get('title').toString().trim(),
      type: formData.get('type').toString(),
      description: formData.get('description').toString().trim(),
      duration: formData.get('duration').toString().trim(),
      price: formData.get('price').toString().trim(),
      lessons: editingId ? courses.find((course) => course.id === editingId).lessons : [],
    };

    if (!courseData.title || !courseData.description || !courseData.duration || !courseData.price) {
      alert('Preencha todos os campos do curso.');
      return;
    }

    if (editingId) {
      courses = courses.map((course) => (course.id === editingId ? courseData : course));
    } else {
      courses = [courseData, ...courses];
    }

    saveCourses();
    renderCourses();
    resetForm();
  });
}

if (cancelButton) {
  cancelButton.addEventListener('click', resetForm);
}

if (adminList) {
  adminList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  const { action, id } = button.dataset;
  const course = courses.find((item) => item.id === id);

  if (!course) {
    return;
  }

    if (action === 'edit') {
      editingId = course.id;
      courseIdInput.value = course.id;
      document.getElementById('title').value = course.title;
      document.getElementById('type').value = course.type;
      document.getElementById('description').value = course.description;
      document.getElementById('duration').value = course.duration;
      document.getElementById('price').value = course.price;
      formTitle.textContent = 'Editar curso';
      document.getElementById('title').focus();
    }

    if (action === 'delete') {
      const confirmed = window.confirm(`Deseja excluir o curso "${course.title}"?`);
      if (!confirmed) {
        return;
      }

      courses = courses.filter((item) => item.id !== id);
      saveCourses();
      renderCourses();
      if (editingId === id) {
        resetForm();
      }
    }

    if (action === 'lessons') {
      openLessonManager(course);
    }
  });
}

function openLessonManager(course) {
  managingCourseId = course.id;
  lessonManager.hidden = false;
  lessonCourseTitle.textContent = course.title;
  renderLessonList(course);
  lessonManager.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetLessonForm() {
  lessonForm.reset();
  lessonIdInput.value = '';
  lessonForm.querySelector('button[type="submit"]').textContent = 'Adicionar aula';
}

function getResourceLabel(type) {
  return { video: 'Vídeo', pdf: 'PDF', link: 'Link externo', file: 'Arquivo' }[type] || 'Recurso';
}

function renderLessonList(course) {
  lessonList.innerHTML = course.lessons.length
    ? course.lessons.map((lesson, index) => `
      <article class="lesson-item">
        <div class="lesson-number">${String(index + 1).padStart(2, '0')}</div>
        <div class="lesson-copy">
          <strong>${lesson.title}</strong>
          <p>${lesson.description || 'Sem descrição adicional.'}</p>
          <span class="badge">${getResourceLabel(lesson.resourceType)}${lesson.resourceName ? ` · ${lesson.resourceName}` : ''}</span>
        </div>
        <div class="actions">
          <button class="action-btn edit" data-lesson-action="edit" data-id="${lesson.id}">Editar</button>
          <button class="action-btn delete" data-lesson-action="delete" data-id="${lesson.id}">Excluir</button>
        </div>
      </article>
    `).join('')
    : '<p class="empty-state">Nenhuma aula cadastrada. Comece adicionando o primeiro conteúdo.</p>';
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', reject);
    reader.readAsDataURL(file);
  });
}

if (lessonForm) {
  lessonForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const course = courses.find((item) => item.id === managingCourseId);
    if (!course) return;

    const formData = new FormData(lessonForm);
    const file = formData.get('resourceFile');
    const resourceUrl = formData.get('resourceUrl').toString().trim();
    let resource = resourceUrl;
    let resourceName = '';

    if (file instanceof File && file.size) {
      if (file.size > 8 * 1024 * 1024) {
        alert('Escolha um arquivo de até 8 MB. Para vídeos, use um link externo.');
        return;
      }
      resource = await readFileAsDataUrl(file);
      resourceName = file.name;
    }

    const lessonData = {
      id: lessonIdInput.value || crypto.randomUUID(),
      title: formData.get('lessonTitle').toString().trim(),
      description: formData.get('lessonDescription').toString().trim(),
      resourceType: formData.get('resourceType').toString(),
      resource,
      resourceName,
    };

    if (!lessonData.title || !lessonData.resource) {
      alert('Informe o título e um link ou arquivo para a aula.');
      return;
    }

    course.lessons = lessonIdInput.value
      ? course.lessons.map((lesson) => lesson.id === lessonIdInput.value ? lessonData : lesson)
      : [...course.lessons, lessonData];
    saveCourses();
    renderCourses();
    renderLessonList(course);
    resetLessonForm();
  });
}

if (lessonList) {
  lessonList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-lesson-action]');
    if (!button) return;
    const course = courses.find((item) => item.id === managingCourseId);
    const lesson = course?.lessons.find((item) => item.id === button.dataset.id);
    if (!course || !lesson) return;

    if (button.dataset.lessonAction === 'delete') {
      course.lessons = course.lessons.filter((item) => item.id !== lesson.id);
    } else {
      lessonIdInput.value = lesson.id;
      document.getElementById('lesson-title').value = lesson.title;
      document.getElementById('lesson-description').value = lesson.description;
      document.getElementById('lesson-resource-type').value = lesson.resourceType;
      document.getElementById('lesson-resource').value = lesson.resource.startsWith('data:') ? '' : lesson.resource;
      lessonForm.querySelector('button[type="submit"]').textContent = 'Salvar alterações';
      return;
    }
    saveCourses();
    renderCourses();
    renderLessonList(course);
  });
}

if (document.getElementById('close-lesson-manager')) {
  document.getElementById('close-lesson-manager').addEventListener('click', () => { lessonManager.hidden = true; });
}

if (document.getElementById('cancel-lesson-edit')) {
  document.getElementById('cancel-lesson-edit').addEventListener('click', resetLessonForm);
}

renderCourses();

const coursePage = document.getElementById('course-page');

function renderCoursePage() {
  if (!coursePage) return;
  const courseId = new URLSearchParams(window.location.search).get('id');
  const course = courses.find((item) => item.id === courseId);
  if (!course) {
    coursePage.innerHTML = '<section class="empty-state"><h1>Curso não encontrado</h1><p>Volte ao catálogo para escolher outro curso.</p><a class="btn btn-primary" href="index.html">Voltar ao início</a></section>';
    return;
  }

  const lessons = course.lessons || [];
  coursePage.innerHTML = `
    <section class="course-heading">
      <a class="back-link" href="${course.type === 'gravado' ? 'cursos-gravados.html' : 'cursos-online.html'}">← Voltar ao catálogo</a>
      <span class="type-pill">${course.type === 'gravado' ? 'Curso gravado' : 'Curso online'}</span>
      <h1>${course.title}</h1>
      <p class="course-description">${course.description}</p>
      <div class="meta"><span>⏱ ${course.duration}</span><span>💸 ${course.price}</span><span>▣ ${lessons.length} aulas</span></div>
      <a class="btn btn-primary" href="inscricao.html?courseId=${course.id}">Inscrever-se neste curso</a>
    </section>
    <section class="course-content">
      <div class="section-header"><h2>Conteúdo do curso</h2><p>Acompanhe as aulas e acesse os materiais disponíveis.</p></div>
      <div class="public-lesson-list">${lessons.length ? lessons.map(createPublicLesson).join('') : '<p class="empty-state">Este curso ainda não possui aulas publicadas.</p>'}</div>
    </section>
  `;
}

function createPublicLesson(lesson, index) {
  const resource = lesson.resourceType === 'video'
    ? `<div class="resource-frame"><iframe src="${lesson.resource}" title="${lesson.title}" loading="lazy" allowfullscreen></iframe></div>`
    : `<a class="resource-link" href="${lesson.resource}" target="_blank" rel="noopener">Abrir ${getResourceLabel(lesson.resourceType).toLowerCase()} <span>↗</span></a>`;
  return `
    <article class="public-lesson">
      <div class="lesson-number">${String(index + 1).padStart(2, '0')}</div>
      <div class="lesson-copy"><h3>${lesson.title}</h3><p>${lesson.description || 'Material disponível para estudo.'}</p>${resource}</div>
    </article>
  `;
}

renderCoursePage();

const courseEditorPage = document.getElementById('course-editor-page');

function renderCourseEditorPage() {
  if (!courseEditorPage) return;
  const courseId = new URLSearchParams(window.location.search).get('id');
  const course = courses.find((item) => item.id === courseId);
  if (!course) {
    courseEditorPage.innerHTML = '<p class="empty-state">Curso não encontrado. <a href="admin.html">Voltar ao administrador</a></p>';
    return;
  }
  courseEditorPage.innerHTML = `
    <section class="course-heading"><a class="back-link" href="admin.html">← Voltar ao administrador</a><span class="type-pill">Editor de conteúdo</span><h1>${course.title}</h1><p class="course-description">Cadastre e organize as aulas deste curso.</p></section>
    <section class="panel">
      <form id="page-lesson-form" class="lesson-form">
        <label for="page-lesson-title">Título da aula</label><input id="page-lesson-title" name="title" required />
        <label for="page-lesson-description">Descrição</label><textarea id="page-lesson-description" name="description" rows="2"></textarea>
        <div class="lesson-fields"><div><label for="page-resource-type">Tipo</label><select id="page-resource-type" name="resourceType"><option value="video">Vídeo por link</option><option value="pdf">PDF por link</option><option value="link">Link externo</option><option value="file">Arquivo local</option></select></div><div><label for="page-resource">URL</label><input id="page-resource" name="resource" type="url" placeholder="https://..." /></div></div>
        <label for="page-file">Ou selecione um arquivo</label><input id="page-file" name="file" type="file" />
        <button class="btn btn-primary" type="submit">Adicionar aula</button>
      </form>
      <div id="page-lesson-list" class="lesson-list"></div>
    </section>`;
  renderEditorLessons(course);
  document.getElementById('page-lesson-form').addEventListener('submit', (event) => addEditorLesson(event, course));
}

function renderEditorLessons(course) {
  const list = document.getElementById('page-lesson-list');
  if (!list) return;
  const freshList = list.cloneNode(false);
  list.replaceWith(freshList);
  freshList.innerHTML = course.lessons.length ? course.lessons.map((lesson, index) => `
    <article class="lesson-item"><div class="lesson-number">${String(index + 1).padStart(2, '0')}</div><div class="lesson-copy"><strong>${lesson.title}</strong><p>${lesson.description || 'Sem descrição adicional.'}</p><span class="badge">${getResourceLabel(lesson.resourceType)}${lesson.resourceName ? ` · ${lesson.resourceName}` : ''}</span></div><button class="action-btn delete" data-editor-delete="${lesson.id}">Excluir</button></article>`).join('') : '<p class="empty-state">Nenhuma aula cadastrada.</p>';
  freshList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-editor-delete]');
    if (!button) return;
    course.lessons = course.lessons.filter((lesson) => lesson.id !== button.dataset.editorDelete);
    saveCourses();
    renderEditorLessons(course);
  });
}

async function addEditorLesson(event, course) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const formData = new FormData(formElement);
  const file = formData.get('file');
  let resource = formData.get('resource').toString().trim();
  let resourceName = '';
  if (file instanceof File && file.size) {
    if (file.size > 8 * 1024 * 1024) return alert('Escolha um arquivo de até 8 MB.');
    resource = await readFileAsDataUrl(file);
    resourceName = file.name;
  }
  if (!formData.get('title').toString().trim() || !resource) return alert('Informe título e recurso.');
  course.lessons.push({ id: crypto.randomUUID(), title: formData.get('title').toString().trim(), description: formData.get('description').toString().trim(), resourceType: formData.get('resourceType').toString(), resource, resourceName });
  saveCourses();
  formElement.reset();
  renderEditorLessons(course);
}

renderCourseEditorPage();

function loadStudents() {
  try {
    const saved = localStorage.getItem(STUDENT_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Não foi possível carregar os alunos salvos.', error);
    return [];
  }
}

function saveStudents(students) {
  localStorage.setItem(STUDENT_STORAGE_KEY, JSON.stringify(students));
}

const students = loadStudents();
const studentList = document.getElementById('student-list');
const studentCount = document.getElementById('student-count');
const studentOptions = document.getElementById('student-course-options');
const studentIdInput = document.getElementById('student-id');

function renderCourseOptions(selectedIds = []) {
  if (!studentOptions) return;
  studentOptions.innerHTML = courses.map((course) => `<label class="check-option"><input type="checkbox" name="courseIds" value="${course.id}" ${selectedIds.includes(course.id) ? 'checked' : ''}>${course.title}</label>`).join('');
}

function renderStudents() {
  if (!studentList) return;
  studentCount.textContent = `${students.length} ${students.length === 1 ? 'aluno' : 'alunos'}`;
  studentList.innerHTML = students.length ? students.map((student) => {
    const names = student.courseIds.map((id) => courses.find((course) => course.id === id)?.title).filter(Boolean);
    return `<article class="admin-item"><div><strong>${student.name}</strong><p>${student.email} · ${student.phone}</p><p>${student.address}</p><span class="badge">${names.length ? names.join(', ') : 'Sem curso vinculado'}</span></div><div class="actions"><button class="action-btn edit" data-student-action="edit" data-id="${student.id}">Editar</button><button class="action-btn delete" data-student-action="delete" data-id="${student.id}">Excluir</button></div></article>`;
  }).join('') : '<p class="empty-state">Nenhum aluno cadastrado.</p>';
}

function resetStudentForm() {
  if (!studentForm) return;
  studentForm.reset();
  studentIdInput.value = '';
  document.getElementById('student-form-title').textContent = 'Cadastrar aluno';
  renderCourseOptions();
}

if (studentForm) {
  renderCourseOptions();
  renderStudents();
  studentForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(studentForm);
    const student = { id: studentIdInput.value || crypto.randomUUID(), name: data.get('name').toString().trim(), address: data.get('address').toString().trim(), phone: data.get('phone').toString().trim(), email: data.get('email').toString().trim().toLowerCase(), courseIds: data.getAll('courseIds') };
    const index = students.findIndex((item) => item.id === student.id);
    if (index >= 0) students[index] = student; else students.unshift(student);
    saveStudents(students);
    resetStudentForm();
    renderStudents();
  });
}

if (document.getElementById('cancel-student-edit')) document.getElementById('cancel-student-edit').addEventListener('click', resetStudentForm);
if (studentList) studentList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-student-action]');
  if (!button) return;
  const student = students.find((item) => item.id === button.dataset.id);
  if (!student) return;
  if (button.dataset.studentAction === 'delete') {
    if (!window.confirm(`Deseja excluir o aluno "${student.name}"?`)) return;
    students.splice(students.indexOf(student), 1);
    saveStudents(students);
    renderStudents();
    return;
  }
  studentIdInput.value = student.id;
  ['name', 'address', 'phone', 'email'].forEach((field) => { document.getElementById(`student-${field}`).value = student[field]; });
  document.getElementById('student-form-title').textContent = 'Editar aluno';
  renderCourseOptions(student.courseIds);
  document.getElementById('student-name').focus();
});

const enrollmentCourse = document.getElementById('enrollment-course');
if (enrollmentCourse) {
  const requestedCourseId = new URLSearchParams(window.location.search).get('courseId');
  enrollmentCourse.innerHTML = `<option value="">Selecione um curso</option>${courses.map((course) => `<option value="${course.id}" ${course.id === requestedCourseId ? 'selected' : ''}>${course.title}</option>`).join('')}`;
}

if (enrollmentForm) enrollmentForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(enrollmentForm);
  const email = data.get('email').toString().trim().toLowerCase();
  const existing = students.find((student) => student.email === email);
  const student = existing || { id: crypto.randomUUID(), name: '', address: '', phone: '', email, courseIds: [] };
  student.name = data.get('name').toString().trim();
  student.address = data.get('address').toString().trim();
  student.phone = data.get('phone').toString().trim();
  student.courseIds = [...new Set([...student.courseIds, data.get('courseId').toString()])];
  if (!existing) students.unshift(student);
  saveStudents(students);
  document.getElementById('enrollment-feedback').textContent = 'Inscrição realizada com sucesso.';
  enrollmentForm.reset();
});
