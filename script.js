const display = document.querySelector('#calc-display');
const history = document.querySelector('#calc-history');
const keys = document.querySelector('.calculator__keys');

const state = {
  displayValue: '0',
  firstOperand: null,
  operator: null,
  awaitingSecondOperand: false,
  history: '',
};

const performCalculation = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => (b === 0 ? NaN : a / b),
};

function updateDisplay() {
  display.textContent = formatNumber(state.displayValue);
  history.textContent = state.history;
}

function formatNumber(value) {
  if (value === 'Erro') return value;
  const [integerPart = '0', decimalPart] = value.split('.');
  const isNegative = integerPart.startsWith('-');
  const sanitizedInteger = isNegative ? integerPart.slice(1) : integerPart;
  const formattedInteger = Number(sanitizedInteger || '0').toLocaleString('pt-BR');
  const sign = isNegative ? '-' : '';

  if (decimalPart !== undefined) {
    const decimalText = decimalPart === '' ? '' : decimalPart;
    return `${sign}${formattedInteger},${decimalText}`;
  }

  return `${sign}${formattedInteger}`;
}

function inputDigit(digit) {
  if (state.awaitingSecondOperand) {
    state.displayValue = digit;
    state.awaitingSecondOperand = false;
  } else {
    state.displayValue =
      state.displayValue === '0' ? digit : state.displayValue + digit;
  }
}

function inputDecimal() {
  if (state.awaitingSecondOperand) {
    state.displayValue = '0.';
    state.awaitingSecondOperand = false;
    return;
  }
  if (!state.displayValue.includes('.')) {
    state.displayValue += '.';
  }
}

function handleOperator(nextOperator) {
  const inputValue = parseFloat(state.displayValue);

  if (state.operator && state.awaitingSecondOperand) {
    state.operator = nextOperator;
    state.history = `${formatHistoryValue(state.firstOperand)} ${symbolForOperator(nextOperator)}`;
    return;
  }

  if (state.firstOperand === null && !Number.isNaN(inputValue)) {
    state.firstOperand = inputValue;
  } else if (state.operator) {
    const currentValue = state.firstOperand || 0;
    const result = performCalculation[state.operator](currentValue, inputValue);
    if (Number.isNaN(result) || !Number.isFinite(result)) {
      state.displayValue = 'Erro';
      resetState();
      updateDisplay();
      return;
    }
    state.displayValue = String(roundResult(result));
    state.firstOperand = parseFloat(state.displayValue);
  }

  state.awaitingSecondOperand = true;
  state.operator = nextOperator;
  state.history = `${formatHistoryValue(state.firstOperand)} ${symbolForOperator(nextOperator)}`;
}

function formatHistoryValue(value) {
  return Number(value).toLocaleString('pt-BR');
}

function symbolForOperator(operator) {
  return (
    {
      '+': '+',
      '-': '−',
      '*': '×',
      '/': '÷',
    }[operator] || operator
  );
}

function handleEquals() {
  const inputValue = parseFloat(state.displayValue);

  if (state.operator === null || state.awaitingSecondOperand) {
    return;
  }

  const result = performCalculation[state.operator](state.firstOperand, inputValue);
  if (Number.isNaN(result) || !Number.isFinite(result)) {
    state.displayValue = 'Erro';
    resetState();
    updateDisplay();
    return;
  }

  state.displayValue = String(roundResult(result));
  state.history = `${formatHistoryValue(state.firstOperand)} ${symbolForOperator(state.operator)} ${formatHistoryValue(inputValue)} =`;
  state.firstOperand = null;
  state.operator = null;
  state.awaitingSecondOperand = false;
}

function handlePercent() {
  const value = parseFloat(state.displayValue);
  if (Number.isNaN(value)) return;
  state.displayValue = String(roundResult(value / 100));
}

function handleSign() {
  if (state.displayValue === '0') return;
  if (state.displayValue.startsWith('-')) {
    state.displayValue = state.displayValue.slice(1);
  } else {
    state.displayValue = `-${state.displayValue}`;
  }
}

function clearDisplay() {
  state.displayValue = '0';
  state.firstOperand = null;
  state.operator = null;
  state.awaitingSecondOperand = false;
  state.history = '';
}

function resetState() {
  state.firstOperand = null;
  state.operator = null;
  state.awaitingSecondOperand = false;
  state.history = '';
}

function roundResult(value) {
  return Number.parseFloat(value.toFixed(10));
}

function handleKeyPress(value) {
  if (/^[0-9]$/.test(value)) {
    inputDigit(value);
  } else if (value === '.') {
    inputDecimal();
  } else if (value in performCalculation) {
    handleOperator(value);
  } else if (value === 'Enter' || value === '=') {
    handleEquals();
  } else if (value === 'Escape') {
    clearDisplay();
  } else if (value === '%') {
    handlePercent();
  } else if (value === 'Backspace') {
    backspace();
  }
  updateDisplay();
}

function backspace() {
  if (state.awaitingSecondOperand) return;
  if (state.displayValue.length <= 1 || (state.displayValue.length === 2 && state.displayValue.startsWith('-'))) {
    state.displayValue = '0';
  } else {
    state.displayValue = state.displayValue.slice(0, -1);
  }
}

keys.addEventListener('click', (event) => {
  const target = event.target;
  if (!target.closest('button')) return;
  const action = target.dataset.action;
  const value = target.dataset.value;

  switch (action) {
    case 'digit':
      inputDigit(value);
      break;
    case 'decimal':
      inputDecimal();
      break;
    case 'operator':
      handleOperator(value);
      break;
    case 'equals':
      handleEquals();
      break;
    case 'percent':
      handlePercent();
      break;
    case 'sign':
      handleSign();
      break;
    case 'clear':
      clearDisplay();
      break;
    default:
      break;
  }
  updateDisplay();
});

document.addEventListener('keydown', (event) => {
  if (event.key === ',') {
    event.preventDefault();
    inputDecimal();
    updateDisplay();
    return;
  }
  handleKeyPress(event.key);
});

updateDisplay();
