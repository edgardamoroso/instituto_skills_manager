// Validação de CPF (Cadastro de Pessoa Física) — apenas dígitos verificadores.

export function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function checkDigit(digits, factor) {
  let sum = 0;
  for (const digit of digits) {
    sum += digit * factor;
    factor -= 1;
  }
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

export function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // rejeita 000..., 111..., etc.

  const digits = cpf.split('').map(Number);
  const first = checkDigit(digits.slice(0, 9), 10);
  const second = checkDigit(digits.slice(0, 10), 11);
  return first === digits[9] && second === digits[10];
}
