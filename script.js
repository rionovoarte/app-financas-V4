

// Importa os módulos necessários do Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, writeBatch, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Variáveis globais do ambiente Canvas (preenchidas em tempo de execução)
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
// ATENÇÃO: Firebase Config agora está hardcoded com as credenciais fornecidas pelo usuário.
const firebaseConfig = {
    apiKey: "AIzaSyBEuFW_VQEx_smJUOxCsF0Jug_lnzUA2aw",
    authDomain: "offline-d2e68.firebaseapp.com",
    projectId: "offline-d2e68",
    storageBucket: "offline-d2e68.firebasestorage.app",
    messagingSenderId: "524684058670",
    appId: "1:524684058670:web:5141130aee53e059cc7fbf"
};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Instâncias do Firebase
let app;
let db;
let auth;
let userId = null; 
let isAuthReady = false; 

// Arrays para armazenar os dados do usuário
let categories = []; 
let transactions = [];
let budgets = []; 

// Configurações da IA (ATUALIZADO)
let aiConfig = {
    aiPersona: "", 
    aiPersonality: ""
};

// Múltiplas chaves de API Gemini (ARRAY)
let geminiApiKeys = []; 
let currentGeminiApiKeyIndex = 0; // Índice da chave de API atualmente em uso
let chatHistory = []; 
let isSendingMessage = false;
let isGeminiApiReady = false; 

// Flag e armazenamento para dados financeiros para a IA
let hasConsultedFinancialData = false;
let lastFinancialDataString = ''; 

// Flag para controlar a geração do insight inicial
let hasGeneratedInitialInsight = false;

// Variável para controlar o mês atual exibido
let currentMonth = new Date(); // Inicializa com o mês atual

// NOVO: Variável para controlar o mês do gráfico
let chartMonth = new Date();

// Variável global para a instância do gráfico de despesas
let expenseChartInstance = null;
let currentChartType = 'pie'; // Tipo de gráfico padrão

// NOVAS PALETAS DE CORES PARA ATRIBUIÇÃO AUTOMÁTICA
const INCOME_COLORS = ['#2ecc71', '#1abc9c', '#1dd1a1', '#55efc4', '#00b894', '#00d084', '#00e676', '#00ff6a'];
const ESSENTIAL_COLORS = ['#3498db', '#2980b9', '#8e44ad', '#34495e', '#6c5ce7', '#0984e3', '#a29bfe', '#636e72'];
const NON_ESSENTIAL_COLORS = ['#e74c3c', '#e67e22', '#f1c40f', '#ff7675', '#d63031', '#fdcb6e', '#fab1a0', '#ffbe76'];
const CAIXINHA_COLORS = ['#a29bfe', '#74b9ff', '#81ecec', '#ffeaa7', '#00cec9', '#6c5ce7', '#fd79a8', '#f0932b'];

// NOVO: Fila para processar sugestões de despesas da IA
let aiSuggestedExpensesQueue = [];
// NOVO: Armazenamento para as sugestões de otimização de categoria
let categoryOptimizationSuggestionsStore = [];


// --- Funções Auxiliares ---

// Função para gerar UUIDs (IDs únicos)
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0,
            v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Formata um valor numérico para moeda brasileira
function formatCurrency(value) {
    return parseFloat(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Limpa e formata o input de valor para moeda brasileira
function formatCurrencyInput(inputElement) {
    let value = inputElement.value.replace(/\D/g, ''); 
    
    if (value.length === 0) {
        inputElement.value = '';
        return;
    }

    value = (parseInt(value, 10) / 100).toFixed(2); 
    value = value.replace('.', ','); 
    value = value.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.'); 

    inputElement.value = value;
}

// Helper para pegar o mês atual no formato 'YYYY-MM'
function getCurrentMonthYYYYMM(date = new Date()) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
}

// Helper para formatar o mês para exibição (ex: "Julho de 2025")
function formatMonthDisplay(date) {
    // Para o gráfico de evolução, a data pode ser um rótulo "Últimos 6 Meses"
    if (currentChartType === 'line' && date === 'evolution') {
        return "Evolução (6 meses)";
    }
    const options = { month: 'long', year: 'numeric' };
    return date.toLocaleDateString('pt-BR', options);
}

// Função para obter dados financeiros formatados para a IA
function getFinancialDataForAI() {
    const categoryMap = categories.reduce((map, cat) => {
        map[cat.id] = cat.name;
        return map;
    }, {});

    // Calcula resumos financeiros com base nos dados GLOBAIS
    let totalGlobalIncome = 0;
    let totalGlobalPaidExpenses = 0;
    transactions.forEach(t => {
        const isConfirmed = t.status === 'Recebido' || t.status === 'Pago' || t.status === 'Confirmado';
        if (isConfirmed) {
            if (t.type === 'income') totalGlobalIncome += parseFloat(t.amount);
            else if (t.type === 'expense') totalGlobalPaidExpenses += parseFloat(t.amount);
            else if (t.type === 'caixinha' && t.transactionType === 'deposit') totalGlobalPaidExpenses += parseFloat(t.amount);
            else if (t.type === 'caixinha' && t.transactionType === 'withdraw') totalGlobalIncome += parseFloat(t.amount);
        }
    });
    const cumulativeBalance = totalGlobalIncome - totalGlobalPaidExpenses;

    const pendingTransactions = transactions.filter(t => t.status === 'Pendente' && t.categoryId !== 'unknown');
    const totalPending = pendingTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const countPending = pendingTransactions.length;

    const totalCaixinhasSaved = categories
        .filter(cat => cat.type === 'caixinha')
        .reduce((sum, caixinha) => sum + parseFloat(caixinha.savedAmount || 0), 0);

    // --- FORMATAÇÃO DA STRING PARA A IA ---
    let dataString = `A data de hoje é ${new Date().toLocaleDateString('pt-BR')}.\n\n`;

    // 1. Resumo Financeiro (Dados Pré-calculados)
    dataString += "<strong>RESUMO FINANCEIRO (DADOS PRÉ-CALCULADOS):</strong>\n";
    dataString += `- Saldo Total Disponível (Global): ${formatCurrency(cumulativeBalance)}\n`;
    dataString += `- Quantidade de Despesas Pendentes: ${countPending}\n`;
    dataString += `- Valor Total de Despesas Pendentes: ${formatCurrency(totalPending)}\n`;
    dataString += `- Total Guardado em Caixinhas: ${formatCurrency(totalCaixinhasSaved)}\n\n`;

    // 2. Lista de Transações Pendentes (se houver)
    if (countPending > 0) {
        dataString += "<strong>LISTA DETALHADA DE TRANSAÇÕES PENDENTES:</strong>\n";
        const formattedTransactions = pendingTransactions.map(t => {
            const categoryName = categoryMap[t.categoryId] || 'Desconhecida';
            return `- Descrição: ${t.description}, Valor: ${formatCurrency(t.amount)}, Categoria: ${categoryName}`;
        }).join('\n');
        dataString += formattedTransactions;
    } else {
        dataString += "Nenhuma transação pendente no momento.\n";
    }

    dataString += "\n\n--- Fim dos Dados Financeiros ---\n";
    return dataString;
}


// --- NOVO: Funções para Notificações Nativas via Kodular ---

/**
 * Verifica se já foi enviada uma notificação hoje.
 * @returns {boolean} - True se uma notificação já foi enviada, false caso contrário.
 */
function hasSentNotificationToday() {
    const lastSentDate = localStorage.getItem('lastNotificationDate');
    if (!lastSentDate) {
        return false;
    }
    const today = new Date().toISOString().split('T')[0];
    return lastSentDate === today;
}

/**
 * Marca que uma notificação foi enviada hoje.
 */
function markNotificationAsSentToday() {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem('lastNotificationDate', today);
}

/**
 * Tenta executar uma chamada à API Gemini usando uma chave específica, com lógica de retentativa.
 * Se a chave falhar com um erro de cota, tenta a próxima chave na lista.
 * @param {object} payload - O corpo da requisição para a API Gemini.
 * @param {number} attemptIndex - O índice da chave a ser tentada.
 * @param {number} retryCount - O número de tentativas já feitas para esta chave.
 * @returns {Promise<object>} - O resultado da API em caso de sucesso.
 * @throws {Error} - Se todas as chaves falharem.
 */
async function tryNextApiKey(payload, attemptIndex = 0, retryCount = 0) {
    const validKeys = geminiApiKeys.filter(key => key && key.trim() !== '');
    if (attemptIndex >= validKeys.length) {
        throw new Error("Todas as chaves de API falharam ou estão sem cota.");
    }

    const apiKey = validKeys[attemptIndex];
    const model = payload.generationConfig && payload.generationConfig.response_mime_type === "application/json" ? "gemini-1.5-flash-latest" : "gemini-1.5-flash-latest";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    console.log(`Tentando API com a chave ${attemptIndex + 1} (Tentativa ${retryCount + 1}) e modelo ${model}...`);

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorResult = await response.json();
            const errorMessage = errorResult.error ? errorResult.error.message : response.statusText;
            console.error(`Erro da API com a chave ${attemptIndex + 1}:`, errorMessage);

            // Erros que indicam que devemos tentar a PRÓXIMA chave imediatamente (ex: chave inválida, suspensa)
            if (response.status === 400 || response.status === 403) {
                 console.warn(`Chave ${attemptIndex + 1} inválida ou suspensa. Pulando para a próxima.`);
                 return tryNextApiKey(payload, attemptIndex + 1, 0); // Tenta a próxima chave, reseta a contagem de retentativas
            }

            // Erros que indicam que devemos TENTAR NOVAMENTE a MESMA chave (ex: sobrecarga, erro de servidor)
            if ((response.status === 429 || response.status === 503) && retryCount < 3) {
                const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000; // Exponential backoff
                console.warn(`Serviço sobrecarregado. Tentando novamente a chave ${attemptIndex + 1} em ${Math.round(delay/1000)}s.`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return tryNextApiKey(payload, attemptIndex, retryCount + 1); // Tenta a mesma chave novamente
            }
            
            // Se as retentativas falharam para esta chave, tenta a próxima
            return tryNextApiKey(payload, attemptIndex + 1, 0);
        }

        const result = await response.json();
        
        // Se a chave funcionou, atualiza o índice global e o indicador visual
        currentGeminiApiKeyIndex = geminiApiKeys.indexOf(apiKey);
        updateActiveApiKeyIndicator();
        return result; // Retorna o resultado bem-sucedido

    } catch (error) {
        console.error(`Erro de rede ou desconhecido com a chave ${attemptIndex + 1}:`, error);
        // Em caso de erro de rede, tenta a próxima chave
        return tryNextApiKey(payload, attemptIndex + 1, 0);
    }
}


/**
 * Busca por transações pendentes que vencem amanhã e prepara o conteúdo para notificação.
 * Gera também um insight diário da IA.
 * Envia os dados para o Kodular via WebViewString.
 */
async function checkAndSendDailyNotification() {
    // 1. Verifica se a notificação do dia já foi enviada para evitar spam
    if (hasSentNotificationToday()) {
        console.log("Notificação diária já enviada.");
        return;
    }

    // 2. Verifica se a API de IA está pronta
    if (!isGeminiApiReady) {
        console.log("API da IA não está pronta. Abortando notificação.");
        return;
    }
    
    // 3. Encontra transações pendentes que vencem amanhã
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    const upcomingTransactions = transactions.filter(t => t.date === tomorrowStr && t.status === 'Pendente');

    // Monta a primeira parte da mensagem (se houver vencimentos)
    let upcomingMessage = '';
    if (upcomingTransactions.length > 0) {
        const total = upcomingTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
        const type = upcomingTransactions[0].type === 'income' ? 'recebimentos' : 'despesas';
        upcomingMessage = `Atenção: Você tem ${upcomingTransactions.length} ${type} no valor de ${formatCurrency(total)} vencendo amanhã.`;
    }

    // 4. Gera um insight rápido da IA como resumo do dia
    const insightPrompt = `
        Analise os dados financeiros a seguir.
        Sua tarefa é fornecer um insight MUITO CURTO e direto (máximo de 2 frases) para ser usado em uma notificação.
        Foque em UMA informação útil para o usuário saber hoje, como o saldo atual ou o total de despesas pendentes.
        Exemplo: "Seu saldo atual é de R$ 1.234,56 e você possui R$ 500,00 em contas pendentes."
        Responda apenas com o texto do insight, sem formatação.

        DADOS:
        ${getFinancialDataForAI()}
    `;

    const payload = {
        contents: [{ role: "user", parts: [{ text: insightPrompt }] }],
        generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 100
        },
    };
    
    let aiInsight = 'Abra o app para ver seus insights.'; // Mensagem padrão
    try {
        const result = await tryNextApiKey(payload);
        if (result.candidates && result.candidates[0].content.parts[0].text) {
            aiInsight = result.candidates[0].content.parts[0].text.trim();
        }
    } catch (error) {
        console.error("Erro ao gerar insight para notificação:", error);
    }
    
    // 5. Combina as mensagens e só envia se houver algo relevante
    let finalMessageBody = upcomingMessage;
    if (finalMessageBody && aiInsight) {
        finalMessageBody += `\n${aiInsight}`; // Adiciona o insight se houver lembrete
    } else if (aiInsight) {
        finalMessageBody = aiInsight; // Se não houver lembrete, usa só o insight
    }

    if (!finalMessageBody) {
        console.log("Nenhum conteúdo relevante para notificar hoje.");
        return; // Não envia notificação vazia
    }
    
    // 6. Prepara o JSON para o Kodular
    const notificationData = {
        title: "Seu Resumo Financeiro Diário",
        message: finalMessageBody
    };
    
    // 7. Envia para o Kodular através do WebViewString
    if (window.AppInventor && typeof window.AppInventor.setWebViewString === 'function') {
        try {
            const jsonString = JSON.stringify(notificationData);
            window.AppInventor.setWebViewString(jsonString);
            console.log("Enviando dados de notificação para o Kodular:", jsonString);
            
            // Marca a notificação como enviada para não repetir no mesmo dia
            markNotificationAsSentToday();
        } catch (e) {
            console.error("Erro ao enviar dados para o Kodular:", e);
        }
    } else {
        console.log("Interface do Kodular (WebViewString) não encontrada. A notificação não será enviada.");
        // Em um ambiente de teste no navegador, você pode "simular" o envio aqui
        // console.log("Simulação de notificação:", notificationData);
        // markNotificationAsSentToday();
    }
}
    
// --- NOVO: Função para Enviar Notificação de Teste ---
async function sendTestNotification() {
    // 1. Verifica se a API de IA está pronta
    if (!isGeminiApiReady) {
        showToast("API da IA não está pronta. Configure suas chaves de API.", "error");
        console.log("API da IA não está pronta. Abortando notificação de teste.");
        return;
    }
    
    // 2. Prepara o JSON para o Kodular com uma mensagem de teste
    const notificationData = {
        title: "Teste de Notificação",
        message: "Esta é uma notificação de teste do Finanças Claras. Se você a recebeu, a integração está funcionando!"
    };
    
    // 3. Envia para o Kodular através do WebViewString
    if (window.AppInventor && typeof window.AppInventor.setWebViewString === 'function') {
        try {
            const jsonString = JSON.stringify(notificationData);
            window.AppInventor.setWebViewString(jsonString);
            showToast("Notificação de teste enviada!", "success");
            console.log("Enviando dados de notificação de teste para o Kodular:", jsonString);
        } catch (e) {
            showToast(`Erro ao enviar notificação de teste: ${e.message}`, "error");
            console.error("Erro ao enviar dados de teste para o Kodular:", e);
        }
    } else {
        showToast("Interface do Kodular não encontrada.", "error");
        console.log("Interface do Kodular (WebViewString) não encontrada. A notificação de teste não pôde ser enviada.");
    }
}

// Função para exibir um toast (notificação flutuante)
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return; // Se o container não existe, não faz nada
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: 'fa-solid fa-circle-check',
        error: 'fa-solid fa-circle-xmark',
        info: 'fa-solid fa-circle-info'
    };

    toast.innerHTML = `
        <i class="${icons[type]}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);

    // Trigger the animation
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);

    // Remove the toast after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        // Remove the element from DOM after the fade out animation
        toast.addEventListener('transitionend', () => {
            toast.remove();
        });
    }, 3000);
}


// JavaScript para simular a navegação entre as seções/páginas
document.addEventListener('DOMContentLoaded', async () => {
    // Elementos da Tela de Splash
    const splashScreen = document.getElementById('splash-screen');
    const splashImage = document.getElementById('splash-image');
    const continueToAppButton = document.getElementById('continue-to-app-button');

    // Elementos da Tela de Login
    const loginScreen = document.getElementById('login-screen');
    const loginForm = document.getElementById('login-form');
    const loginEmailInput = document.getElementById('login-email');
    const loginPasswordInput = document.getElementById('login-password');
    const loginErrorMessage = document.getElementById('login-error-message');
    const appContent = document.getElementById('app-content');
    const bodyEl = document.querySelector('body');

    // Elementos do Modal de Confirmação Genérico
    const confirmationModal = document.getElementById('confirmation-modal');
    const confirmationModalTitle = document.getElementById('confirmation-modal-title');
    const confirmationModalMessage = document.getElementById('confirmation-modal-message');
    const cancelConfirmationButton = document.getElementById('cancel-confirmation-button');
    const confirmActionButton = document.getElementById('confirm-action-button');
    let confirmActionCallback = null; // Função a ser executada ao confirmar

    // Seleciona todos os elementos que podem atuar como links de navegação.
    const navLinks = document.querySelectorAll('.nav-link, .mobile-nav-item, [data-page]');
    const pageSections = document.querySelectorAll('.page-section');
    const fabButton = document.getElementById('fab-add-transaction');

    // URLs das imagens de capa
    const splashImages = [
        'https://jonasbrezer.github.io/financas-claras/Capa01.png',
        'https://jonasbrezer.github.io/financas-claras/Capa02.png',
        'https://jonasbrezer.github.io/financas-claras/Capa03.png',
        'https://jonasbrezer.github.io/financas-claras/Capa04.png',
        'https://jonasbrezer.github.io/financas-claras/Capa05.png'
    ];


    // Função para exibir a tela de splash
    function showSplashScreen() {
        // Se a tela de splash estiver oculta no desktop, não faz nada
        if (window.getComputedStyle(splashScreen).display === 'none') {
            return;
        }
        const randomIndex = Math.floor(Math.random() * splashImages.length);
        splashImage.src = splashImages[randomIndex];
        splashScreen.classList.remove('hidden');
    }

    // Função para exibir um modal de confirmação customizado
    function showConfirmationModal(title, message, callback, cancelCallback = null) {
        confirmationModalTitle.textContent = title;
        confirmationModalMessage.textContent = message;
        confirmActionCallback = callback;
        confirmationModal.classList.add('active');

        // Adiciona um manipulador de clique para o botão de cancelar que executa o cancelCallback
        cancelConfirmationButton.onclick = () => {
            closeConfirmationModal();
            if (cancelCallback) {
                cancelCallback();
            }
        };
    }

    // Função para fechar o modal de confirmação
    function closeConfirmationModal() {
        confirmationModal.classList.remove('active');
        confirmActionCallback = null; // Limpa o callback
    }

    // Event listener para o botão de confirmar no modal de confirmação
    confirmActionButton.addEventListener('click', () => {
        if (confirmActionCallback) {
            confirmActionCallback();
        }
        closeConfirmationModal();
    });

    // --- Funções de Persistência (Firebase Firestore) ---
    
    // Função para obter referência a uma coleção (para múltiplos documentos, ex: transações)
    const getUserCollectionRef = (collectionName) => {
        if (!userId) {
            console.error("userId não está definido. Não é possível criar referência de coleção.");
            return null;
        }
        // O caminho completo garante que os dados de cada usuário fiquem isolados e seguros.
        return collection(db, `artifacts/${appId}/users/${userId}/${collectionName}`);
    };

    // Função para obter referência a um documento específico (para dados salvos como um único doc)
    const getUserDocumentRef = (collectionName, docName) => {
        if (!userId) {
            console.error("userId não está definido. Não é possível criar referência de documento.");
            return null;
        }
        // O caminho completo garante que os dados de cada usuário fiquem isolados e seguros.
        return doc(db, `artifacts/${appId}/users/${userId}/${collectionName}/${docName}`);
    };


    // Elementos do Chat
    const chatContainer = document.getElementById('chat-container'); // Container principal do chat
    const chatMessagesDiv = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('chat-send-button'); 
    const chatLoadingIndicator = document.getElementById('chat-loading-indicator');
    const refreshChatDataButton = document.getElementById('refresh-chat-data-button');
    const clearChatButton = document.getElementById('clear-chat-button');
    const activeApiKeyIndicator = document.getElementById('active-api-key-indicator');
    const chatBackButton = document.getElementById('chat-back-button');

    // Elementos das Categorias
    const addCategoryButton = document.getElementById('add-new-category-button');
    const categoryListContainer = document.getElementById('category-list-container');
    const categoryModal = document.getElementById('category-modal');
    const closeCategoryModalButton = document.getElementById('close-category-modal');
    const cancelCategoryButton = document.getElementById('cancel-category-button');
    const categoryForm = document.getElementById('category-form');
    const categoryIdInput = document.getElementById('category-id');
    const categoryNameInput = document.getElementById('category-name');
    const categoryModalTitle = document.getElementById('category-modal-title');
    const categoryTypeRadios = document.querySelectorAll('input[name="category-type"]'); 
    const priorityField = document.getElementById('priority-field'); 
    const categoryPriorityRadios = document.querySelectorAll('input[name="category-priority"]'); 
    const categorySearchInput = document.getElementById('category-search-input');
    // NOVO: Elementos para o campo de Valor Alvo da Categoria/Caixinha
    const targetAmountField = document.getElementById('target-amount-field');
    const categoryTargetAmountInput = document.getElementById('category-target-amount');


    // Elementos das Transações
    const transactionModal = document.getElementById('transaction-modal');
    const closeTransactionModalButton = document.getElementById('close-transaction-modal');
    const transactionForm = document.getElementById('transaction-form');
    const transactionIdInput = document.getElementById('transaction-id');
    const transactionDescriptionInput = document.getElementById('transaction-description');
    const transactionAmountInput = document.getElementById('transaction-amount');
    const transactionDateInput = document.getElementById('transaction-date');
    const addCategoryQuickButton = document.getElementById('add-category-quick-button'); // NOVO BOTÃO
    // Os radios de transaction-type agora são ocultos e controlados pelos botões da Etapa 1
    const transactionTypeRadios = document.querySelectorAll('input[name="transaction-type"]'); 
    const transactionCategorySelect = document.getElementById('transaction-category');
    // ATUALIZADO: Removido o select, agora é um div para botões de rádio
    const transactionStatusOptionsContainer = document.getElementById('transaction-status-options'); 
    const step2Title = document.getElementById('step-2-title'); // Título da Etapa 2
    const noTransactionsMessage = document.getElementById('no-transactions-message');
    const transactionsListContainer = document.getElementById('transactions-list-container');
    // NOVO: Campo de número de parcelas
    const transactionInstallmentsInput = document.getElementById('transaction-installments');
    const installmentsField = document.getElementById('installments-field');
    // NOVO: Elementos de Navegação por Mês
    const prevMonthButton = document.getElementById('prev-month-button');
    const nextMonthButton = document.getElementById('next-month-button');
    const currentMonthDisplay = document.getElementById('current-month-display');
    // NOVO: Elementos de Filtro de Transações
    const filterPillsContainer = document.getElementById('filter-container-pills');
    const filterCategorySelect = document.getElementById('filter-category');
    // NOVO: Elementos de prévia de saldo
    const balancePreviewContainer = document.getElementById('balance-preview-container');
    const balancePreviewLabel = document.getElementById('balance-preview-label');
    const balancePreviewValue = document.getElementById('balance-preview-value');


    // ATUALIZADO: Variáveis de controle para o fluxo multi-etapas do modal de transação
    let currentStep = 1;
    const totalSteps = 3; // Reduzido de 4 para 3
    const transactionSteps = [
        document.getElementById('transaction-step-1'),
        document.getElementById('transaction-step-2'),
        document.getElementById('transaction-step-3')
    ];


    // Elementos do Dashboard (agora com os resumos principais)
    // IDs dos resumos no Dashboard
    const dashboardCurrentBalance = document.getElementById('dashboard-current-balance');
    const dashboardPaidExpenses = document.getElementById('dashboard-paid-expenses');
    const dashboardPendingExpenses = document.getElementById('dashboard-pending-expenses');
    const dashboardTotalCaixinhasSaved = document.getElementById('dashboard-total-caixinhas-saved');
    
    // IDs do resumo compacto
    const compactBalance = document.getElementById('compact-balance');
    const compactPending = document.getElementById('compact-pending');
    const compactCaixinhas = document.getElementById('compact-caixinhas');


    // Elementos do Orçamento
    const configureBudgetButton = document.getElementById('configure-budget-button'); 
    const optimizeBudgetButton = document.getElementById('optimize-budget-button'); 
    const budgetListContainer = document.getElementById('budget-list-container');
    const noBudgetsMessage = document.getElementById('no-budgets-message');

    // Elementos dos Insights (Reestruturado)
    const generateInsightsButton = document.getElementById('generate-insights-button');
    const insightsContentArea = document.getElementById('insights-content-area');

    // Elementos dos Gráficos Interativos (NOVO)
    const prevMonthChartButton = document.getElementById('prev-month-chart-button');
    const nextMonthChartButton = document.getElementById('next-month-chart-button');
    const currentMonthChartDisplay = document.getElementById('current-month-chart-display');
    const chartTypeSelector = document.getElementById('chart-type-selector');



    // Elementos do Modal de Otimização de Orçamento
    const budgetOptimizationModal = document.getElementById('budget-optimization-modal');
    const closeBudgetOptimizationModalButton = document.getElementById('close-budget-optimization-modal');
    const closeBudgetOptimizationButton = document.getElementById('close-budget-optimization-button');
    const budgetOptimizationContent = document.getElementById('budget-optimization-content');
    const budgetOptimizationLoadingIndicator = document.getElementById('budget-optimization-loading-indicator');
    const budgetOptimizationText = document.getElementById('budget-optimization-text');


    // Elementos do Modal de Chave de API (ATUALIZADO PARA MÚLTIPLAS CHAVES)
    const apiManagementLink = document.querySelector('[data-page="api-management"]');
    const apiKeysModal = document.getElementById('api-keys-modal');
    const closeApiKeysModalButton = document.getElementById('close-api-keys-modal');
    const modalApiKeyInputs = [ // Array de inputs para as 5 chaves
        document.getElementById('modal-api-key-1'),
        document.getElementById('modal-api-key-2'),
        document.getElementById('modal-api-key-3'),
        document.getElementById('modal-api-key-4'),
        document.getElementById('modal-api-key-5')
    ];
    const saveApiKeysModalButton = document.getElementById('save-api-keys-modal-button');
    const apiModalStatusMessageDiv = document.getElementById('api-modal-status-message');
    const apiModalMessageText = document.getElementById('api-modal-message-text');

    // Elementos da Configuração de IA (ATUALIZADOS)
    const aiPersonaInput = document.getElementById('ai-persona');
    const aiPersonalityInput = document.getElementById('ai-personality');
    const saveAiConfigButton = document.getElementById('save-ai-config-button');
    const aiConfigStatusMessage = document.getElementById('ai-config-status-message');


    // Elementos do novo Modal de Orçamento
    const budgetModal = document.getElementById('budget-modal');
    const closeBudgetModalButton = document.getElementById('close-budget-modal');
    const cancelBudgetButton = document.getElementById('cancel-budget-button');
    const budgetForm = document.getElementById('budget-form');
    const budgetIdInput = document.getElementById('budget-id');
    const budgetCategorySelect = document.getElementById('budget-category');
    const budgetAmountInput = document.getElementById('budget-amount');
    const budgetModalTitle = document.getElementById('budget-modal-title');


    // Botões de Sair
    const logoutButtonDesktop = document.getElementById('logout-button-desktop');
    
    // NOVO: Elementos do Modal de Otimização de Categorias
    const optimizeCategoriesButton = document.getElementById('optimize-categories-button');
    const categoryOptimizationModal = document.getElementById('category-optimization-modal');
    const closeCategoryOptimizationModalButton = document.getElementById('close-category-optimization-modal');
    const closeCategoryOptimizationButton = document.getElementById('close-category-optimization-button');
    const categoryOptimizationContent = document.getElementById('category-optimization-content');
    const categoryOptimizationLoadingIndicator = document.getElementById('category-optimization-loading-indicator');
    const categoryOptimizationSuggestions = document.getElementById('category-optimization-suggestions');
    
    // NOVO: Elementos do Modal de Análise de Despesas
    const expenseParserButton = document.getElementById('expense-parser-button');
    const expenseParserModal = document.getElementById('expense-parser-modal');
    const closeExpenseParserModalButton = document.getElementById('close-expense-parser-modal');
    const expenseParserForm = document.getElementById('expense-parser-form');
    const expenseParserInput = document.getElementById('expense-parser-input');
    const analyzeExpensesButton = document.getElementById('analyze-expenses-button');

    // NOVO: Botão de Teste de Notificação
    const testNotificationButton = document.getElementById('test-notification-button');

    // NOVO: Elementos do Modal de Ajuste de Saldo
    const adjustBalanceButtonChat = document.getElementById('adjust-balance-button-chat');
    const balanceAdjustmentModal = document.getElementById('balance-adjustment-modal');
    const closeBalanceAdjustmentModalButton = document.getElementById('close-balance-adjustment-modal');
    const cancelAdjustmentButton = document.getElementById('cancel-adjustment-button');
    const balanceAdjustmentForm = document.getElementById('balance-adjustment-form');
    const newBalanceAmountInput = document.getElementById('new-balance-amount');


    // Carrega todos os dados do Firestore
    async function loadAllDataFromFirestore() {
        if (!isAuthReady || !userId) {
            console.warn("Autenticação não pronta ou userId ausente para carregar dados do Firestore. Abortando load.");
            return;
        }
        console.log("loadAllDataFromFirestore called. userId:", userId, "isAuthReady:", isAuthReady);

        // Listener para AI Config - Usa getUserDocumentRef
        onSnapshot(getUserDocumentRef('settings', 'aiConfig'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                aiConfig.aiPersona = data.aiPersona || "Você é um educador financeiro especialista...";
                aiConfig.aiPersonality = data.aiPersonality || "";
            } else {
                 aiConfig.aiPersona = "Você é um educador financeiro especialista...";
                 aiConfig.aiPersonality = "";
            }
            // Popula os campos da UI com os valores carregados ou padrão
            aiPersonaInput.value = aiConfig.aiPersona;
            aiPersonalityInput.value = aiConfig.aiPersonality;
            
            if (!docSnap.exists()) {
                console.log("AI Config não encontrada, salvando padrão.");
                saveAiConfig(); // Salva a configuração padrão se não existir
            }
        }, (error) => {
            console.error("Erro ao carregar AI Config do Firestore:", error);
        });

        // Listener para Categorias (que agora incluem Caixinhas) - Usa getUserDocumentRef
        onSnapshot(getUserDocumentRef('categories', 'userCategories'), (docSnap) => {
            if (docSnap.exists() && docSnap.data().items) {
                categories = docSnap.data().items;
                console.log("Categorias e Caixinhas carregadas do Firestore.");
                renderCategories(categorySearchInput.value);
                updateDashboardAndTransactionSummaries();
                renderChart();
                populateFilterCategories(); 
            } else { 
                categories = [];
                console.log("Categorias e Caixinhas não encontradas ou vazias, inicializando como array vazio.");
                saveCategories(); 
                renderCategories(categorySearchInput.value);
                updateDashboardAndTransactionSummaries();
                renderChart();
                populateFilterCategories();
            }
        }, (error) => {
            console.error("Erro ao carregar Categorias do Firestore:", error);
        });

        // Listener para Orçamentos - Usa getUserDocumentRef
        onSnapshot(getUserDocumentRef('budgets', 'userBudgets'), (docSnap) => {
            if (docSnap.exists() && docSnap.data().items) {
                budgets = docSnap.data().items;
                console.log("Orçamentos carregados do Firestore.");
                renderBudgets();
            } else { 
                budgets = [];
                console.log("Orçamentos não encontrados ou vazios, inicializando como array vazio.");
                saveBudgets(); 
                renderBudgets();
            }
        }, (error) => {
            console.error("Erro ao carregar Orçamentos do Firestore:", error);
        });

        // Listener para Chaves de API Gemini (ARRAY) - NOVO
        onSnapshot(getUserDocumentRef('settings', 'geminiApiKeys'), (docSnap) => {
            if (docSnap.exists() && docSnap.data().keys && Array.isArray(docSnap.data().keys)) {
                geminiApiKeys = docSnap.data().keys;
                // Popula os campos do modal com as chaves salvas
                modalApiKeyInputs.forEach((input, index) => {
                    input.value = geminiApiKeys[index] || '';
                });
                updateApiModalStatus("Chaves de API carregadas.", "info");
                isGeminiApiReady = geminiApiKeys.some(key => key.trim() !== ''); // Pronto se houver qualquer chave
                console.log("Chaves de API Gemini carregadas do Firestore.");
            } else {
                geminiApiKeys = [];
                modalApiKeyInputs.forEach(input => input.value = ''); // Limpa os campos
                updateApiModalStatus("Nenhuma chave de API salva ainda. Por favor, insira e salve.", "info");
                isGeminiApiReady = false;
                console.log("Chaves de API Gemini não encontradas no Firestore.");
            }
            updateChatUIState();
        }, (error) => {
            console.error("Erro ao carregar Chaves de API Gemini do Firestore:", error);
            geminiApiKeys = [];
            updateApiModalStatus(`Erro ao carregar chaves de API: ${error.message}`, "error");
            isGeminiApiReady = false;
            updateChatUIState();
        });

        // Listener para Transações - Usa getUserCollectionRef
        const transactionsColRef = getUserCollectionRef('transactions');
        if (transactionsColRef) { 
            onSnapshot(query(transactionsColRef, orderBy('date', 'desc')), (querySnapshot) => {
                transactions = [];
                querySnapshot.forEach((doc) => {
                    transactions.push({ id: doc.id, ...doc.data() });
                });
                console.log("Transações carregadas do Firestore.");
                renderTransactions();
                updateDashboardAndTransactionSummaries();
                renderChart();
                checkAndSendDailyNotification(); // Checa por notificações após carregar transações
            }, (error) => {
                console.error("Erro ao carregar Transações do Firestore:", error);
            });
        }
    }

    // Função para exibir o status de salvamento (NOVO)
    function showAiConfigSaveStatus() {
        aiConfigStatusMessage.classList.remove('hidden');
        setTimeout(() => {
            aiConfigStatusMessage.classList.add('hidden');
        }, 2000); // A mensagem desaparece após 2 segundos
    }

    // Salva a configuração da IA no Firestore (ATUALIZADO)
    async function saveAiConfig() {
        if (!isAuthReady || !userId) {
            console.warn("Autenticação não pronta ou userId ausente.");
            return;
        }
        try {
            const aiConfigRef = getUserDocumentRef('settings', 'aiConfig');
            const dataToSave = {
                aiPersona: aiPersonaInput.value,
                aiPersonality: aiPersonalityInput.value
            };
            if (aiConfigRef) {
                await setDoc(aiConfigRef, dataToSave, { merge: true }); // Usar merge para não sobrescrever
                showToast("Configurações da IA salvas com sucesso!", "success");
                console.log("Configurações da IA salvas.");
            }
        } catch (error) {
            console.error("Erro ao salvar AI Config:", error);
            showToast(`Erro ao salvar configurações da IA: ${error.message}`, "error");
        }
    }

    // Salva categorias no Firestore (como um único documento com array)
    // Agora lida com categorias normais e caixinhas
    async function saveCategories() {
        if (!isAuthReady || !userId) { 
            console.warn("saveCategories: Autenticação não pronta ou userId ausente. Tentando salvar localmente por agora.");
            showToast('Erro: Autenticação não pronta para salvar no banco.', 'error');
            return; 
        }
        try {
            const userCategoriesRef = getUserDocumentRef('categories', 'userCategories');
            if (userCategoriesRef) {
                await setDoc(userCategoriesRef, { items: categories || [] }); 
                console.log("saveCategories: Categorias e Caixinhas salvas com sucesso no Firestore!");
            }
        } catch (error) {
            console.error("saveCategories: Erro ao salvar Categorias no Firestore:", error);
            showToast(`Erro ao salvar categoria: ${error.message}`, 'error');
        }
    }

    // Salva uma transação individual ou um grupo de transações no Firestore (adicione ou atualize)
    async function saveTransaction(transactionData, installments = 1) {
        if (!isAuthReady || !userId) { console.warn("Autenticação não pronta ou userId ausente."); return; }
        
        try {
            const transactionsColRef = getUserCollectionRef('transactions');
            if (!transactionsColRef) return;

            const batch = writeBatch(db); // Usar batch para operações atômicas

            if (installments > 1 && !transactionData.recurrenceId) {
                // Se for uma nova transação parcelada, gera um recurrenceId para o grupo
                const recurrenceId = generateUUID();
                for (let i = 0; i < installments; i++) {
                    const newTransaction = { ...transactionData };
                    newTransaction.id = generateUUID(); // Novo ID para cada parcela
                    newTransaction.recurrenceId = recurrenceId;
                    newTransaction.installmentNumber = i + 1; // Parcela 1, 2, 3...
                    newTransaction.totalInstallments = installments; // Total de parcelas
                    
                    // Ajusta a data para os meses futuros
                    const originalDate = new Date(transactionData.date + 'T12:00:00');
                    const futureDate = new Date(originalDate.getFullYear(), originalDate.getMonth() + i, originalDate.getDate());
                    newTransaction.date = futureDate.toISOString().split('T')[0];

                    // Ajusta a descrição para indicar a parcela
                    newTransaction.description = `${transactionData.description} (Parc. ${i + 1}/${installments})`;

                    batch.set(doc(transactionsColRef, newTransaction.id), newTransaction);
                }
            } else {
                // Se for uma transação única ou edição de uma parcela existente
                if (transactionData.id) {
                    batch.set(doc(transactionsColRef, transactionData.id), transactionData, { merge: true });
                } else {
                    batch.set(doc(transactionsColRef, generateUUID()), transactionData);
                }
            }
            await batch.commit();
            console.log("Transação(ões) salva(s) com sucesso!");
        } catch (error) {
            console.error("Erro ao salvar Transação(ões):", error);
            showToast(`Erro ao salvar transação: ${error.message}`, 'error');
        }
    }

    // Deleta uma transação individual ou um grupo de transações recorrentes do Firestore
    async function deleteTransactionFromFirestore(id, recurrenceId = null) {
        if (!isAuthReady || !userId) { console.warn("Autenticação não pronta ou userId ausente."); return; }
        try {
            const batch = writeBatch(db);
            const transactionsColRef = getUserCollectionRef('transactions');
            if (!transactionsColRef) return;

            if (recurrenceId) {
                // Deleta todas as transações com o mesmo recurrenceId
                const q = query(transactionsColRef, where("recurrenceId", "==", recurrenceId));
                const querySnapshot = await getDocs(q);
                querySnapshot.forEach((docSnap) => {
                    batch.delete(doc(transactionsColRef, docSnap.id));
                });
                console.log(`Deletando todas as transações com recurrenceId: ${recurrenceId}`);
            } else {
                // Deleta apenas a transação individual
                console.log(`Deletando transação individual: ${id}`);
                batch.delete(doc(transactionsColRef, id));
            }
            await batch.commit();
            showToast("Transação(ões) deletada(s) com sucesso.", "success");
        } catch (error) {
            console.error("Erro ao deletar Transação(ões):", error);
            showToast(`Erro ao deletar transação: ${error.message}`, 'error');
        }
    }

    // Salva orçamentos no Firestore (como um único documento com array)
    async function saveBudgets() {
        if (!isAuthReady || !userId) { console.warn("Autenticação não pronta ou userId ausente."); return; }
        try {
            const userBudgetsRef = getUserDocumentRef('budgets', 'userBudgets');
            if (userBudgetsRef) {
                await setDoc(userBudgetsRef, { items: budgets || [] });
                // Não mostra toast aqui para não ser verboso, a UI se atualiza
            }
        } catch (error) {
            console.error("Erro ao salvar Orçamentos:", error);
            showToast(`Erro ao salvar orçamento: ${error.message}`, 'error');
        }
    }

    // Salva as chaves da API Gemini no Firestore (ARRAY) - ATUALIZADO
    async function saveApiKeys() {
        if (!isAuthReady || !userId) { 
            updateApiModalStatus("Erro: Autenticação não pronta para salvar as chaves de API.", "error");
            return; 
        }
        const keysToSave = modalApiKeyInputs.map(input => input.value.trim());
        
        // Validação simples: pelo menos uma chave deve ser preenchida
        if (keysToSave.every(key => key === '')) {
            updateApiModalStatus("Por favor, insira pelo menos uma chave de API válida.", "error");
            return;
        }

        try {
            const apiKeyRef = getUserDocumentRef('settings', 'geminiApiKeys');
            if (apiKeyRef) {
                await setDoc(apiKeyRef, { keys: keysToSave });
                geminiApiKeys = keysToSave; // Atualiza o array local
                updateApiModalStatus("Chaves de API salvas com sucesso!", "success");
                isGeminiApiReady = geminiApiKeys.some(key => key.trim() !== '');
                updateChatUIState();
                console.log("Chaves de API Gemini salvas no Firestore.");
            }
        } catch (error) {
            console.error("Erro ao salvar Chaves de API Gemini no Firestore:", error);
            updateApiModalStatus(`Erro ao salvar chaves de API: ${error.message}`, "error");
        }
    }
    // --- FIM das Funções de Persistência (Firebase Firestore) ---

    await initializeFirebase();
    
    // A função loadApiKey agora é disparada pelo onSnapshot dentro de loadAllDataFromFirestore
    // e não precisa mais ser chamada explicitamente aqui ou em openApiKeysModal.
    // A UI de chat será atualizada pelo onSnapshot da chave de API.

    // --- Funções de UI e Navegação ---

    // Função para exibir a página correta
    function showPage(pageId) {
        pageSections.forEach(section => {
            section.classList.remove('active');
        });
        const activePage = document.getElementById(pageId);
        if (activePage) {
            activePage.classList.add('active');
        }

        // Atualizar o estado ativo dos links de navegação
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.dataset.page === pageId && (link.classList.contains('nav-link') || link.classList.contains('mobile-nav-item'))) {
                link.classList.add('active');
            }
        });

        // Controla a visibilidade do botão flutuante
        if (pageId === 'dashboard' || pageId === 'transactions') {
            fabButton.classList.remove('hidden');
        } else {
            fabButton.classList.add('hidden');
        }


        // Ações específicas ao carregar cada página
        if (pageId === 'chat') {
            chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
            bodyEl.classList.add('chat-active');
        } else {
            bodyEl.classList.remove('chat-active');
        }
        
        if (pageId === 'categories-management') {
            renderCategories();
        } else if (pageId === 'transactions') {
            // Ao entrar na página de transações, garante que o mês atual seja exibido
            currentMonth = new Date(); // Reseta para o mês atual
            updateMonthDisplay();
            renderTransactions();
            updateDashboardAndTransactionSummaries();
        } 
        else if (pageId === 'dashboard') {
            updateDashboardAndTransactionSummaries();
            chartMonth = new Date(); // Reseta o mês do gráfico
            updateChartMonthDisplay();
            renderChart();
            if (!hasGeneratedInitialInsight) {
                generateFinancialInsights(); // Gera o insight ao entrar na página
                hasGeneratedInitialInsight = true; // Marca que o insight inicial foi gerado
            }
        } else if (pageId === 'budget-management') {
            renderBudgets();
        } else if (pageId === 'ai-config') {
            // Os valores já são populados pelo onSnapshot
            aiPersonaInput.value = aiConfig.aiPersona;
            aiPersonalityInput.value = aiConfig.aiPersonality;
        }
    }

    // Função para atualizar os cards de resumo no Dashboard e na aba Transações
    function updateDashboardAndTransactionSummaries() {
        let totalGlobalIncome = 0;
        let totalGlobalPaidExpenses = 0;
        let totalPaidExpensesThisMonth = 0;
        let totalPendingThisMonth = 0; // Nome alterado para clareza

        const currentMonthYYYYMM = getCurrentMonthYYYYMM(currentMonth);

        // Calcula o saldo cumulativo global (até o final de todos os tempos)
        transactions.forEach(t => {
            const isConfirmed = t.status === 'Recebido' || t.status === 'Pago' || t.status === 'Confirmado';
            if (isConfirmed) {
                if (t.type === 'income') {
                    totalGlobalIncome += parseFloat(t.amount);
                } else if (t.type === 'expense') {
                    totalGlobalPaidExpenses += parseFloat(t.amount);
                } else if (t.type === 'caixinha') {
                    if (t.transactionType === 'deposit') {
                        totalGlobalPaidExpenses += parseFloat(t.amount);
                    } else if (t.transactionType === 'withdraw') {
                        totalGlobalIncome += parseFloat(t.amount);
                    }
                }
            }
        });

        // Calcula as despesas PAGAS e PENDENTES para o mês ATUALMENTE exibido
        transactions.forEach(t => {
            const transactionMonth = t.date.substring(0, 7);
            if (transactionMonth === currentMonthYYYYMM) {
                // Soma aqui tanto receitas quanto despesas pendentes
                if (t.status === 'Pendente') { 
                    totalPendingThisMonth += parseFloat(t.amount);
                } else if (t.type === 'expense' && t.status === 'Pago') {
                    totalPaidExpensesThisMonth += parseFloat(t.amount);
                }
            }
        });

        const cumulativeBalance = totalGlobalIncome - totalGlobalPaidExpenses;
        const totalCaixinhasSaved = categories
            .filter(cat => cat.type === 'caixinha')
            .reduce((sum, caixinha) => sum + parseFloat(caixinha.savedAmount || 0), 0);

        // Atualiza Dashboard
        if (dashboardCurrentBalance) dashboardCurrentBalance.textContent = formatCurrency(cumulativeBalance);
        if (dashboardPaidExpenses) dashboardPaidExpenses.textContent = formatCurrency(totalPaidExpensesThisMonth);
        if (dashboardPendingExpenses) dashboardPendingExpenses.textContent = formatCurrency(totalPendingThisMonth);
        if (dashboardTotalCaixinhasSaved) dashboardTotalCaixinhasSaved.textContent = formatCurrency(totalCaixinhasSaved);

        // Atualiza resumo compacto
        if (compactBalance) compactBalance.textContent = formatCurrency(cumulativeBalance);
        if (compactPending) compactPending.textContent = formatCurrency(totalPendingThisMonth);
        if (compactCaixinhas) compactCaixinhas.textContent = formatCurrency(totalCaixinhasSaved);
    }




    // --- Funções de Gerenciamento de Categorias ---

    /**
     * Retorna a próxima cor disponível para uma categoria com base no seu tipo e prioridade.
     * A função tenta encontrar uma cor que ainda não esteja em uso por outras categorias
     * do mesmo tipo/prioridade. Se todas as cores da paleta estiverem em uso, ela cicla.
     * @param {string} type - O tipo da categoria ('income', 'expense', 'caixinha').
     * @param {string} [priority] - A prioridade da categoria ('essential', 'non-essential'), aplicável apenas a 'expense'.
     * @returns {string} A cor hexadecimal selecionada.
     */
    function getNextAvailableColor(type, priority = null) {
        let palette;
        if (type === 'income') {
            palette = INCOME_COLORS;
        } else if (type === 'expense') {
            palette = (priority === 'essential') ? ESSENTIAL_COLORS : NON_ESSENTIAL_COLORS;
        } else if (type === 'caixinha') {
            palette = CAIXINHA_COLORS;
        } else {
            return '#9E9E9E'; // Cor padrão de fallback
        }

        // Filtra as categorias existentes para encontrar as do mesmo tipo/prioridade
        const relevantCategories = categories.filter(cat => {
            if (cat.type !== type) return false;
            if (type === 'expense' && cat.priority !== priority) return false;
            return true;
        });

        const usedColors = new Set(relevantCategories.map(cat => cat.color));

        // Tenta encontrar uma cor não utilizada
        for (const color of palette) {
            if (!usedColors.has(color)) {
                return color;
            }
        }

        // Se todas foram usadas, reutiliza de forma cíclica
        return palette[relevantCategories.length % palette.length];
    }

    // Função para renderizar as categorias (e caixinhas) na lista
    function renderCategories(filter = '') {
        categoryListContainer.innerHTML = '';

        const filteredCategories = categories.filter(cat => 
            cat.name.toLowerCase().includes(filter.toLowerCase())
        );

        if (filteredCategories.length === 0 && filter === '') {
            categoryListContainer.innerHTML = '<p class="text-center text-gray-500 py-4">Nenhuma categoria ou caixinha cadastrada. Adicione uma nova!</p>';
        } else if (filteredCategories.length === 0 && filter !== '') {
            categoryListContainer.innerHTML = `<p class="text-center text-gray-500 py-4">Nenhuma categoria ou caixinha encontrada para "${filter}".</p>`;
        }

        filteredCategories.forEach(category => {
            const categoryItem = document.createElement('div');
            categoryItem.className = 'bg-white p-4 rounded-lg shadow-sm flex items-start justify-between';
            
            let typeDisplay = '';
            let priorityDisplay = '';
            let detailsHtml = '';

            if (category.type === 'income') {
                typeDisplay = 'Receita';
                detailsHtml = `<p class="text-sm text-gray-500">${typeDisplay}</p>`;
            } else if (category.type === 'expense') {
                typeDisplay = 'Despesa';
                priorityDisplay = category.priority ? (category.priority === 'essential' ? 'Essencial' : 'Não Essencial') : '';
                detailsHtml = `<p class="text-sm text-gray-500">${typeDisplay} &bull; ${priorityDisplay}</p>`;
            } else if (category.type === 'caixinha') {
                typeDisplay = 'Caixinha';
                const saved = parseFloat(category.savedAmount || 0);
                const target = parseFloat(category.targetAmount || 0);
                const progress = (target > 0) ? (saved / target) * 100 : 0;
                const progressBarColor = progress >= 100 ? 'bg-green-500' : (progress > 50 ? 'bg-blue-500' : 'bg-yellow-500');

                detailsHtml = `
                    <p class="text-sm text-gray-500">${typeDisplay}</p>
                    <p class="text-sm text-gray-600 mt-1">
                        <span class="font-medium">${formatCurrency(saved)}</span> de ${formatCurrency(target)}
                    </p>
                    <div class="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mt-2">
                        <div class="${progressBarColor} h-2.5 rounded-full" style="width: ${Math.min(100, progress)}%"></div>
                    </div>
                    <p class="text-xs text-gray-500 mt-1 text-right">${progress.toFixed(0)}% Concluído</p>
                `;
            }

            categoryItem.innerHTML = `
                <div class="flex items-start flex-grow">
                    <div class="w-4 h-4 rounded-full mr-4 mt-1" style="background-color: ${category.color};"></div>
                    <div class="flex-grow">
                        <p class="font-semibold text-lg text-gray-800">${category.name}</p>
                        ${detailsHtml}
                    </div>
                </div>
                <div class="relative">
                    <button class="action-menu-button p-2 rounded-full hover:bg-gray-100" data-id="${category.id}">
                        <i class="fa-solid fa-ellipsis-vertical text-gray-500"></i>
                    </button>
                    <div class="action-menu-dropdown hidden">
                        <a href="#" class="edit-category-button" data-id="${category.id}">Editar</a>
                        <a href="#" class="delete-category-button" data-id="${category.id}">Apagar</a>
                    </div>
                </div>
            `;
            categoryListContainer.appendChild(categoryItem);
        });
    }

    // Abre o modal de categoria (agora também para caixinhas)
    function openCategoryModal(category = null) {
        categoryModal.classList.add('active');
        categoryForm.reset(); // Limpa o formulário
        categoryTargetAmountInput.value = ''; // Limpa o campo de valor alvo

        if (category) {
            categoryModalTitle.textContent = 'Editar Categoria';
            categoryIdInput.value = category.id;
            categoryNameInput.value = category.name;
            document.querySelector(`input[name="category-type"][value="${category.type}"]`).checked = true;
            
            // Controla a visibilidade do campo de prioridade
            if (category.type === 'expense') {
                priorityField.style.display = 'block';
                document.querySelector(`input[name="category-priority"][value="${category.priority || 'essential'}"]`).checked = true;
            } else {
                priorityField.style.display = 'none';
            }

            // Controla a visibilidade e preenche o campo de valor alvo para caixinhas
            if (category.type === 'caixinha') {
                targetAmountField.style.display = 'block';
                categoryTargetAmountInput.value = (parseFloat(category.targetAmount || 0) * 100).toFixed(0);
                formatCurrencyInput(categoryTargetAmountInput); // Formata o valor
            } else {
                targetAmountField.style.display = 'none';
            }

        } else { // Adicionar nova categoria/caixinha
            categoryModalTitle.textContent = 'Adicionar Nova Categoria ou Caixinha';
            categoryIdInput.value = '';
            categoryNameInput.value = '';
            document.querySelector('input[name="category-type"][value="expense"]').checked = true; // Padrão para Despesa
            priorityField.style.display = 'block'; // Visível por padrão para despesa
            document.querySelector(`input[name="category-priority"][value="essential"]`).checked = true;
            targetAmountField.style.display = 'none'; // Escondido por padrão
        }
    }

    // Fecha o modal de categoria
    function closeCategoryModal() {
        categoryModal.classList.remove('active');
        categoryForm.reset();
    }

    // Lida com o envio do formulário de categoria
    categoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = categoryIdInput.value;
        const name = categoryNameInput.value.trim();
        const type = document.querySelector('input[name="category-type"]:checked').value;
        
        if (!name) {
            showToast('O nome da categoria é obrigatório!', 'error');
            return;
        }
        
        let priority = (type === 'expense') ? document.querySelector('input[name="category-priority"]:checked').value : null;
        let targetAmount = null;
        let savedAmount = null;

        if (type === 'caixinha') {
            const targetAmountFormatted = categoryTargetAmountInput.value.replace(/\./g, '').replace(',', '.');
            targetAmount = parseFloat(targetAmountFormatted) || 0;
            // Se estiver editando uma caixinha existente, mantém o savedAmount
            if (id) {
                const existingCategory = categories.find(cat => cat.id === id);
                savedAmount = existingCategory ? existingCategory.savedAmount : 0;
            } else {
                // Se for uma nova caixinha, o valor guardado começa em 0
                savedAmount = 0;
            }
        }

        if (id) { // Editando uma categoria existente
            const index = categories.findIndex(cat => cat.id === id);
            if (index !== -1) {
                const originalCategory = categories[index];
                const mudouTipo = originalCategory.type !== type;
                const mudouPrioridade = originalCategory.priority !== priority;
                                        
                // Mantém a cor se o tipo/prioridade não mudar
                let newColor = originalCategory.color; 
                                        
                // Recalcula a cor apenas se o tipo ou prioridade mudou
                if (mudouTipo || mudouPrioridade) {
                    newColor = getNextAvailableColor(type, priority);
                }
                categories[index] = { 
                    ...originalCategory, 
                    name, 
                    type, 
                    priority, 
                    color: newColor,
                    targetAmount: targetAmount, // Atualiza targetAmount
                    savedAmount: savedAmount // Atualiza savedAmount
                };
            }
        } else { // Criando uma nova categoria
            const newColor = getNextAvailableColor(type, priority);
            const newCategory = { 
                id: generateUUID(), 
                name, 
                type, 
                priority, 
                color: newColor,
                targetAmount: targetAmount,
                savedAmount: savedAmount
            };
                                
            categories.push(newCategory);
        }
        await saveCategories();
        showToast('Categoria salva com sucesso!', 'success');
        
        // Se o modal de transação estiver aberto, atualiza a lista de categorias lá
        if(transactionModal.classList.contains('active')) {
            const selectedType = document.querySelector('input[name="transaction-type"]:checked').value;
            // Encontra o ID da categoria que acabou de ser criada/editada
            const lastSavedCategory = categories.find(c => c.name === name && c.type === type);
            populateTransactionCategories(selectedType);
            // Seleciona a categoria recém-criada
            if(lastSavedCategory) {
                 transactionCategorySelect.value = lastSavedCategory.id;
            }
        }
        closeCategoryModal(); // Fecha o modal após salvar
    });

    // Lida com cliques nos botões de editar/excluir categorias (delegação de eventos)
    categoryListContainer.addEventListener('click', (e) => {
        const target = e.target;

        const editButton = target.closest('.edit-category-button');
        if (editButton) {
            const id = editButton.dataset.id;
            const categoryToEdit = categories.find(cat => cat.id === id);
            if (categoryToEdit) {
                openCategoryModal(categoryToEdit);
            }
        } 
        
        const deleteButton = target.closest('.delete-category-button');
        if (deleteButton) {
            const id = deleteButton.dataset.id;
            const categoryToDelete = categories.find(cat => cat.id === id);

            showConfirmationModal(
                "Confirmar Exclusão",
                `Tem certeza que deseja excluir a categoria "${categoryToDelete.name}"? As transações associadas não serão deletadas, mas serão marcadas como "Desconhecidas". Orçamentos para esta categoria também serão apagados.`,
                async () => {
                    // Marca as transações como "desconhecidas" para que não contem em futuros cálculos.
                    transactions.forEach(t => {
                        if (t.categoryId === id) {
                            t.categoryId = 'unknown'; 
                        }
                    });
                    
                    // Apaga os orçamentos associados a esta categoria.
                    budgets = budgets.filter(b => b.categoryId !== id);

                    // Remove a categoria da lista.
                    categories = categories.filter(cat => cat.id !== id);

                    // Salva todas as mudanças de uma vez para consistência.
                    await saveAllTransactionsInBatch();
                    await saveBudgets();
                    await saveCategories();
                    
                    showToast("Categoria deletada.", "info");
                    // A UI será atualizada automaticamente pelos listeners do onSnapshot.
                }
            );
        }
    });

    // Lógica para mostrar/esconder o campo de prioridade e valor alvo
    categoryTypeRadios.forEach(radio => {
        radio.addEventListener('change', (event) => {
            const selectedType = event.target.value;
            // Mostra/esconde campo de prioridade
            priorityField.style.display = (selectedType === 'expense') ? 'block' : 'none';
            // Mostra/esconde campo de valor alvo
            targetAmountField.style.display = (selectedType === 'caixinha') ? 'block' : 'none';
            // Limpa o valor do campo alvo se não for caixinha
            if (selectedType !== 'caixinha') {
                categoryTargetAmountInput.value = '';
            }
        });
    });

    // Listener para formatar o input de valor alvo da categoria/caixinha
    categoryTargetAmountInput.addEventListener('input', () => {
        formatCurrencyInput(categoryTargetAmountInput);
    });


    // --- Funções de Gerenciamento de Transações ---

    // Função para popular o dropdown de categorias (e caixinhas) no modal de transações
    function populateTransactionCategories(selectedTransactionType = null) {
        const previouslySelected = transactionCategorySelect.value; // Salva a categoria selecionada
        transactionCategorySelect.innerHTML = '<option value="">Selecione uma Categoria</option>';

        let filteredCategories = [];
        // A lógica aqui precisa ser mais inteligente para o novo fluxo:
        // Se for 'income' ou 'expense', filtra por essas categorias.
        // Se for 'deposit' ou 'withdraw', filtra por categorias do tipo 'caixinha'.
        if (selectedTransactionType === 'expense' || selectedTransactionType === 'income') {
            filteredCategories = categories.filter(cat => cat.type === selectedTransactionType);
        } else if (selectedTransactionType === 'deposit' || selectedTransactionType === 'withdraw') {
            filteredCategories = categories.filter(cat => cat.type === 'caixinha');
        }

        if (filteredCategories.length > 0) {
            filteredCategories.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.id;
                option.textContent = cat.name; 
                transactionCategorySelect.appendChild(option);
            });
        } else {
            transactionCategorySelect.innerHTML += '<option value="" disabled>Nenhuma categoria disponível para este tipo</option>';
        }

        // Tenta restaurar a seleção anterior se ela ainda for válida na nova lista
        if (Array.from(transactionCategorySelect.options).some(opt => opt.value === previouslySelected)) {
            transactionCategorySelect.value = previouslySelected;
        }
    }


    // Renderiza as transações
    function renderTransactions() {
        transactionsListContainer.innerHTML = `
            <div class="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-200"></div>
        `; 

        const currentMonthYYYYMM = getCurrentMonthYYYYMM(currentMonth);

        // APLICA FILTROS (NOVO)
        const activeTypePill = document.querySelector('.filter-pill[data-filter-group="type"].active');
        const typeFilter = activeTypePill ? activeTypePill.dataset.value : 'all';

        const activeStatusPill = document.querySelector('.filter-pill[data-filter-group="status"].active');
        const statusFilter = activeStatusPill ? activeStatusPill.dataset.value : 'all';
        
        const categoryFilter = filterCategorySelect.value;

        // NOVO: Verifica se o filtro "Ver Tudo" está ativo
        const showAllPill = document.querySelector('.filter-pill[data-value="show-all"]');
        const isShowAllActive = showAllPill && showAllPill.classList.contains('active');

        const filteredTransactions = transactions.filter(t => {
            // Se "Ver Tudo" não estiver ativo, filtra pelo mês
            if (!isShowAllActive) {
                const transactionMonth = t.date.substring(0, 7);
                if (transactionMonth !== currentMonthYYYYMM) return false;
            }
            
            if (typeFilter !== 'all' && t.type !== typeFilter) return false;
            if (statusFilter !== 'all' && t.status !== statusFilter) return false;
            if (categoryFilter !== 'all' && t.categoryId !== categoryFilter) return false;
            
            return true;
        });

        if (filteredTransactions.length === 0) {
            transactionsListContainer.innerHTML += '<p class="text-center text-gray-500 py-4" id="no-transactions-message">Nenhuma transação encontrada para os filtros selecionados.</p>';
            return;
        }

        const groupedTransactions = filteredTransactions.reduce((acc, transaction) => {
            const date = transaction.date;
            if (!acc[date]) {
                acc[date] = [];
            }
            acc[date].push(transaction);
            return acc;
        }, {});

        const sortedDates = Object.keys(groupedTransactions).sort((a, b) => new Date(b) - new Date(a));

        sortedDates.forEach(date => {
            const dateGroupDiv = document.createElement('div');
            dateGroupDiv.className = 'mb-6 relative pl-8';

            const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

            dateGroupDiv.innerHTML = `
                <div class="timeline-bullet-date">
                    <i class="fa-solid fa-calendar-days text-xs"></i>
                </div>
                <h3 class="text-lg font-semibold mb-3 ml-2">${formattedDate}</h3>
                <div class="space-y-3"></div>
            `;
            const transactionsForDateDiv = dateGroupDiv.querySelector('.space-y-3');

            groupedTransactions[date].sort((a, b) => {
                const dateA = new Date(a.date);
                const dateB = new Date(b.date);
                if (dateA.getTime() === dateB.getTime()) {
                    return a.description.localeCompare(b.description);
                }
                return dateB - dateA;
            }).forEach(transaction => {
                let categoryName = 'Categoria Desconhecida';
                let bulletColor = '#9E9E9E';
                let amountColorClass = '';
                let amountPrefix = '';
                let transactionTypeDisplay = '';

                const category = categories.find(cat => cat.id === transaction.categoryId);
                if (category) {
                    categoryName = category.name;
                    bulletColor = category.color;
                } else if (transaction.categoryId === 'unknown') {
                    categoryName = 'Categoria Desconhecida';
                    bulletColor = '#9E9E9E';
                }

                if (transaction.type === 'income') {
                    amountColorClass = 'text-[var(--color-green-positive)]';
                    amountPrefix = '+';
                    transactionTypeDisplay = categoryName;
                } else if (transaction.type === 'expense') {
                    amountColorClass = 'text-[var(--color-red-negative)]';
                    amountPrefix = '-';
                    transactionTypeDisplay = categoryName;
                } else if (transaction.type === 'caixinha') {
                    if (transaction.transactionType === 'deposit') {
                        amountColorClass = 'text-blue-600'; // Cor azul para depósito
                        amountPrefix = '→'; // Seta para indicar movimento
                        transactionTypeDisplay = `Depósito em: ${categoryName}`;
                    } else if (transaction.transactionType === 'withdraw') {
                        amountColorClass = 'text-indigo-600'; // Cor índigo para resgate
                        amountPrefix = '←'; // Seta para indicar movimento
                        transactionTypeDisplay = `Resgate de: ${categoryName}`;
                    }
                }
                
                const isPaidOrReceived = (transaction.status === 'Pago' || transaction.status === 'Recebido' || transaction.status === 'Confirmado');
                const bulletClass = isPaidOrReceived ? 'transaction-bullet paid' : 'transaction-bullet';
                const bulletStyle = isPaidOrReceived ? `background-color: ${bulletColor};` : `border: 2px solid ${bulletColor};`;
                
                const statusIndicatorText = transaction.status === 'Pendente' ? 'Pendente' : 
                                            (transaction.type === 'income' && transaction.status === 'Recebido' ? 'Recebido' : 
                                            (transaction.type === 'expense' && transaction.status === 'Pago' ? 'Pago' : 
                                            (transaction.type === 'caixinha' && transaction.status === 'Confirmado' ? 'Confirmado' : '')));
                const statusIndicatorHtml = statusIndicatorText ? `<p class="transaction-item-status">${statusIndicatorText}</p>` : '';

                const installmentInfo = transaction.installmentNumber && transaction.totalInstallments ? 
                                        `<span class="transaction-item-installment">(Parc. ${transaction.installmentNumber}/${transaction.totalInstallments})</span>` : '';

                const transactionItem = document.createElement('div');
                transactionItem.className = `bg-white p-4 rounded-lg shadow-sm flex justify-between items-center relative pl-8`; 
                transactionItem.innerHTML = `
                    <div class="${bulletClass}" style="${bulletStyle}" data-id="${transaction.id}"></div>
                    <div class="flex-grow min-w-0">
                        <p class="transaction-item-title">${transactionTypeDisplay} ${installmentInfo}</p>
                        ${statusIndicatorHtml}
                        <p class="transaction-item-description">${transaction.description}</p>
                    </div>
                    <div class="flex items-center space-x-2 ml-4">
                        <p class="transaction-item-amount ${amountColorClass}">${amountPrefix} ${formatCurrency(transaction.amount)}</p>
                        <div class="relative">
                            <button class="action-menu-button p-2 rounded-full hover:bg-gray-100" data-id="${transaction.id}">
                                <i class="fa-solid fa-ellipsis-vertical text-gray-500"></i>
                            </button>
                            <div class="action-menu-dropdown hidden">
                                <a href="#" class="edit-transaction-button" data-id="${transaction.id}">Editar</a>
                                <a href="#" class="delete-transaction-button" data-id="${transaction.id}">Apagar</a>
                                ${transaction.recurrenceId ? `<a href="#" class="delete-recurrence-button" data-recurrence-id="${transaction.recurrenceId}">Apagar Recorrência</a>` : ''}
                            </div>
                        </div>
                    </div>
                `;
                transactionsForDateDiv.appendChild(transactionItem);
            });
            transactionsListContainer.appendChild(dateGroupDiv);
        });
        
    }

    // Função para atualizar as opções de status com botões de rádio
    function updateTransactionStatusOptions(transactionType) {
        const statusContainer = document.getElementById('transaction-status-options');
        statusContainer.innerHTML = '';
        let options = [];
        if (transactionType === 'income') {
            options = [{ value: 'Recebido', label: 'Recebido' }, { value: 'Pendente', label: 'Pendente' }];
        } else if (transactionType === 'expense') {
            options = [{ value: 'Pago', label: 'Pago' }, { value: 'Pendente', label: 'Pendente' }];
        } else { // caixinha (deposit/withdraw)
            options = [{ value: 'Confirmado', label: 'Confirmado' }]; // Simplificado para caixinhas
        }

        options.forEach((opt, index) => {
            const wrapper = document.createElement('div');
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'transaction-status-radio'; // Novo nome para evitar conflito com o select removido
            input.id = `status-${opt.value}`;
            input.value = opt.value;
            input.className = 'hidden peer';
            if (index === 0) input.checked = true; // Marca a primeira opção como padrão

            const label = document.createElement('label');
            label.htmlFor = `status-${opt.value}`;
            label.textContent = opt.label;
            label.className = 'px-4 py-2 border rounded-lg cursor-pointer transition peer-checked:bg-[var(--color-blue-primary)] peer-checked:text-white peer-checked:border-[var(--color-blue-primary)]';
            
            wrapper.appendChild(input);
            wrapper.appendChild(label);
            statusContainer.appendChild(wrapper);
        });
    }

    // Função para controlar a visibilidade das etapas do modal de transação
    function goToStep(stepNumber, preserveState = false) {
        if (stepNumber < 1 || stepNumber > totalSteps) {
            console.error("Tentativa de ir para uma etapa inválida:", stepNumber);
            return;
        }

        let savedCategory = '';
        if (preserveState) {
            savedCategory = transactionCategorySelect.value;
        }

        currentStep = stepNumber;
        transactionSteps.forEach((step, index) => {
            if (index + 1 === currentStep) {
                step.classList.remove('hidden');
            } else {
                step.classList.add('hidden');
            }
        });
        
        balancePreviewContainer.classList.add('hidden');

        // Ações específicas para cada etapa ao navegar
        if (currentStep === 2) {
            const selectedType = document.querySelector('input[name="transaction-type"]:checked').value;
            populateTransactionCategories(selectedType);
            if (preserveState && savedCategory) {
                 transactionCategorySelect.value = savedCategory;
            }

            // Mostra ou esconde o botão de sugestão de IA e a prévia de saldo
            if (selectedType === 'deposit') {
                balancePreviewContainer.classList.remove('hidden');
                balancePreviewLabel.textContent = "Saldo Disponível para Guardar:";
                balancePreviewValue.textContent = formatCurrency(parseFloat(dashboardCurrentBalance.textContent.replace('R$', '').replace(/\./g, '').replace(',', '.')));
            } else if (selectedType === 'withdraw') {
                 // A prévia para resgate será mostrada quando uma caixinha for selecionada
                 balancePreviewContainer.classList.add('hidden');
            } else {
                balancePreviewContainer.classList.add('hidden');
            }

            transactionAmountInput.focus();
        } else if (currentStep === 3) {
            // Lógica combinada da antiga etapa 3 e 4
            const selectedType = document.querySelector('input[name="transaction-type"]:checked').value;
            updateTransactionStatusOptions(selectedType); // Move a chamada para cá
            if (transactionIdInput.value) {
                const transactionToEdit = transactions.find(t => t.id === transactionIdInput.value);
                if (transactionToEdit) {
                    const statusRadio = document.querySelector(`input[name="transaction-status-radio"][value="${transactionToEdit.status}"]`);
                    if (statusRadio) statusRadio.checked = true;
                }
            }
            
            if (selectedType === 'expense' || selectedType === 'income') {
                installmentsField.style.display = 'block';
            } else {
                installmentsField.style.display = 'none';
                transactionInstallmentsInput.value = 1;
            }

            if (transactionIdInput.value) {
                const transactionToEdit = transactions.find(t => t.id === transactionIdInput.value);
                 if (transactionToEdit && transactionToEdit.totalInstallments) {
                    transactionInstallmentsInput.value = transactionToEdit.totalInstallments;
                    transactionInstallmentsInput.disabled = true;
                } else {
                    transactionInstallmentsInput.value = 1;
                    transactionInstallmentsInput.disabled = false;
                }
            } else {
                transactionInstallmentsInput.value = 1;
                transactionInstallmentsInput.disabled = false;
            }
            transactionDateInput.focus();
        }
    }


    // Abre o modal de transação (agora apenas reseta e vai para a primeira etapa)
    function openTransactionModal(transaction = null) {
        transactionModal.classList.add('active');
        transactionForm.reset();
        transactionDateInput.valueAsDate = new Date(); // Define data padrão
        
        if (transaction) {
            transactionIdInput.value = transaction.id || ''; // Garante que não seja null ou undefined
            transactionAmountInput.value = (parseFloat(transaction.amount) * 100).toFixed(0);
            formatCurrencyInput(transactionAmountInput);
            transactionDescriptionInput.value = transaction.description;
            transactionDateInput.value = transaction.date;

            // Marca o tipo de transação correto para edição
            let typeToSelect = transaction.type;
            if (transaction.type === 'caixinha') {
                typeToSelect = transaction.transactionType; // 'deposit' ou 'withdraw'
            }
            const typeButton = document.querySelector(`.step-1-type-button[data-type="${typeToSelect}"]`);
            if (typeButton) {
                document.querySelectorAll('.step-1-type-button').forEach(btn => btn.classList.remove('selected'));
                typeButton.classList.add('selected');
                document.querySelector(`input[name="transaction-type"][value="${typeToSelect}"]`).checked = true;
            }
            
            populateTransactionCategories(typeToSelect);
            transactionCategorySelect.value = transaction.categoryId;
            goToStep(2, true); // Pula para a etapa 2, preservando o estado
        } else {
            transactionIdInput.value = ''; // Garante que o ID da transação seja limpo para novas transações
            goToStep(1);
            // Remove a classe 'selected' de todos os botões de tipo ao abrir o modal
            document.querySelectorAll('.step-1-type-button').forEach(button => {
                button.classList.remove('selected');
            });
        }
    }

    // Fecha o modal de transação
    function closeTransactionModal() {
        transactionModal.classList.remove('active');
        transactionForm.reset();
        currentStep = 1; // Reseta para a primeira etapa ao fechar
    }

    // Lida com o envio do formulário de transação
    transactionForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        // O tipo agora vem do radio button oculto
        const typeSelectedInStep1 = document.querySelector('input[name="transaction-type"]:checked').value;
        
        const id = transactionIdInput.value;
        const description = transactionDescriptionInput.value.trim();
        
        const amountFormatted = transactionAmountInput.value.replace(/\./g, '').replace(',', '.');
        const amount = parseFloat(amountFormatted);

        const date = transactionDateInput.value;
        // ATUALIZADO: Obtém o valor do rádio selecionado
        const status = document.querySelector('input[name="transaction-status-radio"]:checked').value; 
        const categoryId = transactionCategorySelect.value;
        const installments = parseInt(transactionInstallmentsInput.value, 10) || 1; // Novo campo de parcelas

        let transactionTypeForCaixinha = null; // 'deposit' or 'withdraw'
        let transactionCategoryType = null; // 'income', 'expense', or 'caixinha'

        // Validação básica (descrição agora é opcional)
        if (isNaN(amount) || !date || !status || !categoryId) {
            showConfirmationModal("Erro de Validação", "Por favor, preencha todos os campos da transação corretamente (valor, data, status, categoria).", () => {});
            return;
        }
        if (installments < 1) {
            showConfirmationModal("Erro de Validação", "O número de parcelas deve ser no mínimo 1.", () => {});
            return;
        }

        // Determina o tipo de transação real ('income', 'expense', 'caixinha')
        // e o tipo de movimento da caixinha ('deposit', 'withdraw')
        const selectedCategory = categories.find(cat => cat.id === categoryId);

        if (!selectedCategory) {
            console.error("Categoria selecionada não encontrada.");
            return;
        }

        transactionCategoryType = selectedCategory.type;

        if (selectedCategory.type === 'caixinha') {
            // Se a categoria é uma caixinha, o 'type' da transação será 'caixinha'
            // e 'transactionTypeForCaixinha' será 'deposit' ou 'withdraw'
            if (typeSelectedInStep1 === 'deposit') {
                transactionTypeForCaixinha = 'deposit';
                selectedCategory.savedAmount = (selectedCategory.savedAmount || 0) + amount;
            } else if (typeSelectedInStep1 === 'withdraw') {
                transactionTypeForCaixinha = 'withdraw';
                if ((selectedCategory.savedAmount || 0) < amount) {
                    showConfirmationModal(
                        "Erro de Resgate",
                        "O valor que você está tentando resgatar é maior do que o valor guardado nesta caixinha. Por favor, ajuste o valor.",
                        () => {} // Não faz nada ao confirmar, apenas fecha o modal
                    );
                    return; // Impede o salvamento da transação
                }
                selectedCategory.savedAmount -= amount;
            }
            await saveCategories(); // Salva o estado atualizado das categorias (que inclui a caixinha)
        }

        // Criar ou atualizar a transação
        const newTransaction = { 
            id: id || generateUUID(), 
            description, 
            amount, 
            date, 
            type: transactionCategoryType, // Usa o tipo real da categoria
            categoryId, 
            status 
        };

        // Adiciona campos específicos para transações de caixinha se aplicável
        if (transactionCategoryType === 'caixinha') {
            newTransaction.transactionType = transactionTypeForCaixinha;
            newTransaction.caixinhaId = selectedCategory.id; // O ID da caixinha é o ID da categoria
        }

        // Salva a transação, passando o número de parcelas
        await saveTransaction(newTransaction, installments);
        showToast("Transação salva com sucesso!", "success");
        closeTransactionModal();

        // **NOVA LÓGICA:** Após salvar, verifica se há mais sugestões na fila da IA
        if (aiSuggestedExpensesQueue.length > 0) {
            processNextAISuggestion();
        }
    });

    // Lida com cliques nos botões de editar/excluir/status (delegação de eventos)
    transactionsListContainer.addEventListener('click', async (e) => {
        const target = e.target;
    
        // Lógica para o botão de editar
        const editButton = target.closest('.edit-transaction-button');
        if (editButton) {
            const id = editButton.dataset.id;
            const transactionToEdit = transactions.find(t => t.id === id);
            if (transactionToEdit) {
                openTransactionModal(transactionToEdit);
            }
            return;
        }
    
        // Lógica para o botão de apagar
        const deleteButton = target.closest('.delete-transaction-button');
        if (deleteButton) {
            const id = deleteButton.dataset.id;
            showConfirmationModal(
                "Confirmar Exclusão",
                "Tem certeza que deseja excluir esta transação?",
                async () => {
                    const deletedTransaction = transactions.find(t => t.id === id);
                    if (deletedTransaction && deletedTransaction.type === 'caixinha' && deletedTransaction.caixinhaId) {
                        const caixinha = categories.find(c => c.id === deletedTransaction.caixinhaId);
                        if (caixinha) {
                            if (deletedTransaction.transactionType === 'deposit') {
                                caixinha.savedAmount -= parseFloat(deletedTransaction.amount);
                            } else if (deletedTransaction.transactionType === 'withdraw') {
                                caixinha.savedAmount += parseFloat(deletedTransaction.amount);
                            }
                            await saveCategories();
                        }
                    }
                    await deleteTransactionFromFirestore(id);
                }
            );
            return;
        }
    
        // Lógica para o botão de apagar recorrência
        const deleteRecurrenceButton = target.closest('.delete-recurrence-button');
        if (deleteRecurrenceButton) {
            const recurrenceId = deleteRecurrenceButton.dataset.recurrenceId;
            showConfirmationModal(
                "Confirmar Exclusão de Parcelas",
                "Tem certeza que deseja excluir TODAS as parcelas desta recorrência? Esta ação não pode ser desfeita.",
                async () => {
                    const transactionsInRecurrence = transactions.filter(t => t.recurrenceId === recurrenceId);
                    for (const t of transactionsInRecurrence) {
                        if (t.type === 'caixinha' && t.caixinhaId) {
                            const caixinha = categories.find(c => c.id === t.caixinhaId);
                            if (caixinha) {
                                if (t.transactionType === 'deposit') {
                                    caixinha.savedAmount -= parseFloat(t.amount);
                                } else if (t.transactionType === 'withdraw') {
                                    caixinha.savedAmount += parseFloat(t.amount);
                                }
                            }
                        }
                    }
                    await saveCategories();
                    await deleteTransactionFromFirestore(null, recurrenceId);
                }
            );
            return;
        }

        // Lógica para clicar na bolinha de status
        if (target.matches('.transaction-bullet')) {
            const id = target.dataset.id;
            const transaction = transactions.find(t => t.id === id);
            
            if (!transaction || transaction.type === 'caixinha') {
                return; // Não faz nada para caixinhas ou se não encontrar a transação
            }

            // Alterna o status
            if (transaction.type === 'expense') {
                transaction.status = (transaction.status === 'Pago') ? 'Pendente' : 'Pago';
            } else if (transaction.type === 'income') {
                transaction.status = (transaction.status === 'Recebido') ? 'Pendente' : 'Recebido';
            }

            // Salva a transação atualizada no Firestore
            await saveTransaction(transaction);
            // O onSnapshot cuidará de re-renderizar, mas pode ser útil para feedback imediato
            // renderTransactions();
        }
    });


    // Listener para formatar o input de valor da transação
    transactionAmountInput.addEventListener('input', () => {
        formatCurrencyInput(transactionAmountInput);
    });

    // NOVO: Listener para mostrar prévia de saldo ao selecionar uma caixinha para resgate
    transactionCategorySelect.addEventListener('change', () => {
        const selectedType = document.querySelector('input[name="transaction-type"]:checked').value;
        if (selectedType === 'withdraw') {
            const categoryId = transactionCategorySelect.value;
            const caixinha = categories.find(c => c.id === categoryId);
            if (caixinha) {
                balancePreviewContainer.classList.remove('hidden');
                balancePreviewLabel.textContent = `Saldo em "${caixinha.name}":`;
                balancePreviewValue.textContent = formatCurrency(caixinha.savedAmount || 0);
            } else {
                balancePreviewContainer.classList.add('hidden');
            }
        }
    });


    // --- Funções de Navegação por Mês ---
    function updateMonthDisplay() {
        const showAllPill = document.querySelector('.filter-pill[data-value="show-all"]');
        const isShowAllActive = showAllPill && showAllPill.classList.contains('active');

        if (isShowAllActive) {
            currentMonthDisplay.textContent = "Exibindo Tudo";
            prevMonthButton.disabled = true;
            nextMonthButton.disabled = true;
            prevMonthButton.classList.add('opacity-50', 'cursor-not-allowed');
            nextMonthButton.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            currentMonthDisplay.textContent = formatMonthDisplay(currentMonth);
            prevMonthButton.disabled = false;
            nextMonthButton.disabled = false;
            prevMonthButton.classList.remove('opacity-50', 'cursor-not-allowed');
            nextMonthButton.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }

    prevMonthButton.addEventListener('click', () => {
        currentMonth.setMonth(currentMonth.getMonth() - 1);
        updateMonthDisplay();
        renderTransactions();
        updateDashboardAndTransactionSummaries();
        renderBudgets();
    });

    nextMonthButton.addEventListener('click', () => {
        currentMonth.setMonth(currentMonth.getMonth() + 1);
        updateMonthDisplay();
        renderTransactions();
        updateDashboardAndTransactionSummaries();
        renderBudgets();
    });


    // --- Funções de Gerenciamento de Orçamento ---
    function openBudgetModal(budget = null) {
        budgetForm.reset();
        budgetCategorySelect.innerHTML = '<option value="">Selecione uma categoria</option>';
            
        // Popula o select com apenas as categorias de despesa
        const expenseCategories = categories.filter(c => c.type === 'expense');
        expenseCategories.forEach(cat => {
            // Impede que categorias já orçadas neste mês apareçam para novos orçamentos
            const isAlreadyBudgeted = budgets.some(b => b.categoryId === cat.id && b.month === getCurrentMonthYYYYMM(currentMonth)); // Usa currentMonth
            if (!budget && isAlreadyBudgeted) return; // Se não estiver editando e já houver orçamento, pula
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            budgetCategorySelect.appendChild(option);
        });

        if (budget) {
            budgetModalTitle.textContent = 'Editar Orçamento';
            budgetIdInput.value = budget.id;
            budgetCategorySelect.value = budget.categoryId;
            budgetCategorySelect.disabled = true; // Não permite mudar a categoria na edição
            budgetAmountInput.value = (parseFloat(budget.amount) * 100).toFixed(0); // Coloca em centavos para formatCurrencyInput
            formatCurrencyInput(budgetAmountInput); // Formata o valor
        } else {
            budgetModalTitle.textContent = 'Novo Orçamento Mensal';
            budgetIdInput.value = '';
            budgetCategorySelect.disabled = false;
        }
        budgetModal.classList.add('active');
    }

    function closeBudgetModal() {
        budgetModal.classList.remove('active');
    }

    function renderBudgets() {
        budgetListContainer.innerHTML = '';
        const currentMonthYYYYMM = getCurrentMonthYYYYMM(currentMonth); // Usa currentMonth
        const currentMonthBudgets = budgets.filter(b => b.month === currentMonthYYYYMM);
        if (currentMonthBudgets.length === 0) {
            noBudgetsMessage.classList.remove('hidden');
            budgetListContainer.innerHTML = ''; // Garante que a lista esteja vazia
            return;
        }
        noBudgetsMessage.classList.add('hidden'); // Esconde a mensagem se houver orçamentos

        currentMonthBudgets.forEach(budget => {
            const category = categories.find(c => c.id === budget.categoryId);
            if (!category) {
                // Se a categoria do orçamento não existe mais, não renderiza o card.
                // A lógica de deleção de categoria deve remover orçamentos associados.
                return;
            }
            
            // Calcula o gasto real para essa categoria no mês corrente
            const totalSpent = transactions.filter(t => 
                    t.categoryId === budget.categoryId && 
                    t.type === 'expense' && // Apenas despesas
                    t.date.startsWith(currentMonthYYYYMM) && // Filtra pelo mês atual
                    (t.status === 'Pago') // Apenas transações pagas
                ).reduce((sum, t) => sum + parseFloat(t.amount), 0);

            const progress = budget.amount > 0 ? (totalSpent / budget.amount) * 100 : 0;
            const remaining = budget.amount - totalSpent;
            const progressBarColor = progress >= 100 ? 'bg-red-500' : (progress > 80 ? 'bg-yellow-500' : 'bg-green-500');
            
            const budgetCard = document.createElement('div');
            budgetCard.className = 'bg-white p-4 rounded-lg shadow-md flex flex-col justify-between';
            budgetCard.innerHTML = `
                <div>
                    <div class="flex items-center mb-2">
                        <div class="w-4 h-4 rounded-full mr-2" style="background-color: ${category.color};"></div>
                        <p class="font-semibold text-lg">${category.name}</p>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2.5 my-2">
                        <div class="${progressBarColor} h-2.5 rounded-full" style="width: ${Math.min(100, progress)}%;"></div>
                    </div>
                    <div class="text-xs flex justify-between">
                        <span class="text-gray-600">${formatCurrency(totalSpent)} de ${formatCurrency(budget.amount)}</span>
                        <span class="font-bold ${remaining < 0 ? 'text-red-500' : 'text-green-600'}">${progress.toFixed(0)}%</span>
                    </div>
                </div>
                <div class="flex justify-end mt-3">
                    <button class="text-gray-500 hover:text-blue-500 p-1 rounded-full edit-budget-button" data-id="${budget.id}">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="text-gray-500 hover:text-red-500 p-1 rounded-full delete-budget-button" data-id="${budget.id}">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            `;
            budgetListContainer.appendChild(budgetCard);
        });
    }
    
    // --- Funções de Chat e IA ---
    
    // Função para atualizar o indicador visual da chave de API ativa
    function updateActiveApiKeyIndicator() {
        const validKeys = geminiApiKeys.filter(key => key && key.trim() !== '');
        if (validKeys.length > 0) {
            activeApiKeyIndicator.textContent = `Chave ${currentGeminiApiKeyIndex + 1}/${validKeys.length}`;
            activeApiKeyIndicator.classList.remove('hidden');
        } else {
            activeApiKeyIndicator.classList.add('hidden');
        }
    }

    function appendMessage(sender, text, type = 'text') {
        const messageDiv = document.createElement('div');
        const bubbleDiv = document.createElement('div');

        if (sender === 'user') {
            messageDiv.className = 'flex justify-end';
            bubbleDiv.className = 'bg-[var(--color-blue-primary)] text-white p-3 rounded-xl rounded-br-none max-w-xs md:max-w-md shadow-sm';
        } else { // sender === 'ai' or 'model'
            messageDiv.className = 'flex justify-start';
            bubbleDiv.className = 'bg-gray-100 text-gray-800 p-3 rounded-xl rounded-bl-none max-w-xs md:max-w-md shadow-sm';
            if (type === 'error') {
                bubbleDiv.classList.add('bg-red-100', 'text-red-700', 'border', 'border-red-400');
            }
        }

        // Usamos innerHTML para renderizar tags HTML básicas que o modelo de IA pode gerar
        bubbleDiv.innerHTML = text; 
        messageDiv.appendChild(bubbleDiv);
        chatMessagesDiv.appendChild(messageDiv);

        chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
    }

    async function sendChatMessage(userMessage) {
        if (isSendingMessage) {
            return;
        }

        if (userMessage.trim() === "") return;

        const validKeys = geminiApiKeys.filter((key) => key && key.trim() !== "");
        if (!isGeminiApiReady || validKeys.length === 0) {
            appendMessage(
                "ai",
                'O assistente de IA não está configurado. Por favor, insira pelo menos uma chave de API válida em "Mais Opções".',
                "error"
            );
            return;
        }

        isSendingMessage = true;
        appendMessage("user", userMessage);
        chatInput.value = "";
        chatLoadingIndicator.classList.remove("hidden");

        const persona = aiConfig.aiPersona || "";
        const personality = aiConfig.aiPersonality || "";

        const baseSystemInstruction = `Você é um assistente financeiro especialista. Sua função é analisar os dados fornecidos e responder às perguntas do usuário com base NESSES DADOS.

<strong>REGRAS DE COMPORTAMENTO CRÍTICAS E INVIOLÁVEIS:</strong>
1.  <strong>NÃO FAÇA CÁLCULOS NEM CONTAGENS:</strong> Você está **TERMINANTEMENTE PROIBIDO** de somar valores ou contar itens de listas.
2.  <strong>USE OS TOTAIS FORNECIDOS:</strong> Para responder sobre saldos, totais ou quantidades, você **DEVE** usar os valores pré-calculados que estão na seção "RESUMO FINANCEIRO (DADOS PRÉ-CALCULADOS)". Por exemplo, se perguntarem o número de despesas pendentes, use o valor de "Quantidade de Despesas Pendentes".
3.  <strong>SEJA UM APRESENTADOR DE DADOS:</strong> Sua principal função é apresentar os dados que foram fornecidos a você. Se o usuário pedir para listar as despesas pendentes, use a "LISTA DETALHADA DE TRANSAÇÕES PENDENTES".
4.  <strong>BASEADO EM DADOS, SEM ALARMISMO:</strong> Suas análises devem ser 100% baseadas nos dados fornecidos. Não use linguagem alarmista como "situação crítica". Em vez disso, aponte os fatos. Ex: "Observei que o valor total de suas despesas pendentes é maior que o seu saldo disponível."
5.  <strong>NÃO PEÇA INFORMAÇÕES NEM REALIZE AÇÕES:</strong> Você já tem todos os dados. Você não pode adicionar, editar ou apagar nada. NUNCA peça ao usuário para registrar transações ou sugira que você pode fazer algo por ele. Se uma informação não está no resumo, diga que não a encontrou.
6.  <strong>PERSONA E FORMATAÇÃO:</strong> Siga estritamente o papel e o tom definidos abaixo e use apenas HTML básico (<strong>, <br>, <ul>, <li>). NUNCA use Markdown.
    *   <strong>Personagem:</strong> ${persona}
    *   <strong>Personalidade:</strong> ${personality}
---`;

        // Busca os dados mais recentes antes de enviar a mensagem
        const currentFinancialData = getFinancialDataForAI();
        const userPromptWithData = `DADOS FINANCEIROS COMPLETOS DO USUÁRIO:\n${currentFinancialData}\n\nMENSAGEM DO USUÁRIO:\n${userMessage}`;

        const contentsPayload = [...chatHistory];
        contentsPayload.push({ role: "user", parts: [{ text: userPromptWithData }] });
        
        const payload = {
            systemInstruction: { role: "system", parts: [{ text: baseSystemInstruction }] },
            contents: contentsPayload, 
            generationConfig: {
                temperature: 0.7, 
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 800
            },
            safetySettings: [ 
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
            ]
        };

        try {
            let result = await tryNextApiKey(payload);
        
            if (result && result.candidates && result.candidates[0].content.parts[0].text) {
                const finalResponse = result.candidates[0].content.parts[0].text;
                appendMessage('ai', finalResponse);
                chatHistory.push({ role: "user", parts: [{ text: userMessage }] }); 
                chatHistory.push({ role: "model", parts: [{ text: finalResponse }] });
            } else if (result.error) {
                throw new Error(result.error.message || 'Erro desconhecido da API Gemini.');
            } else if (!result.candidates || result.candidates.length === 0) {
                 throw new Error('Não foi possível obter uma resposta válida da IA.');
            }

        } catch (error) {
            console.error('Erro ao chamar a API Gemini:', error);
            appendMessage('ai', `Erro de comunicação com a IA. ${error.message}`, 'error');
        } finally {
            if (chatHistory.length > 20) {
                chatHistory = chatHistory.slice(chatHistory.length - 20);
            }
            chatLoadingIndicator.classList.add('hidden');
            chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
            isSendingMessage = false; 
        }
    }


    // --- Funções de Insights Financeiros ---
    async function generateFinancialInsights() {
        insightsContentArea.innerHTML = `
            <div class="text-center text-gray-500 py-2">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                Gerando insights...
            </div>
        `;

        const validKeys = geminiApiKeys.filter(key => key && key.trim() !== '');
        if (!isGeminiApiReady || validKeys.length === 0) {
            insightsContentArea.innerHTML = '<p class="text-red-500">O assistente de IA não está configurado. Por favor, insira sua chave da API Gemini nas "Mais Opções".</p>';
            return;
        }

        // Obtém os dados financeiros atualizados para os insights
        const financialData = getFinancialDataForAI();

        const insightPrompt = `
            Analise os dados financeiros a seguir.
            Sua tarefa é fornecer um insight CURTO e ACIONÁVEL em no máximo 3 frases.
            Foque em apenas UM ponto principal: o maior gasto, uma oportunidade de economia ou um alerta importante (como contas pendentes atrasadas).
            
            REGRAS DE FORMATAÇÃO (OBRIGATÓRIO):
            1.  **Use APENAS tags HTML**.
            2.  Use <strong> para títulos ou alertas. Ex: <strong>Alerta de Gastos</strong>.
            3.  Use <br> para quebras de linha.
            4.  **NUNCA, EM HIPÓTESE ALGUMA, use Markdown (*, **, _, #, etc.)**. O uso de Markdown quebrará a interface.

            DADOS PARA ANÁLISE:
            ${financialData}
        `;

        const payload = {
            contents: [{ role: "user", parts: [{ text: insightPrompt }] }],
            generationConfig: {
                temperature: 0.7, 
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 800
            },
            safetySettings: [ 
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
            ]
        };

        try {
            const result = await tryNextApiKey(payload);

            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0 && result.candidates[0].content.parts[0].text) {
                const aiResponseText = result.candidates[0].content.parts[0].text;
                insightsContentArea.innerHTML = aiResponseText;
            } else if (result.error) {
                insightsContentArea.innerHTML = `<p class="text-red-500">Erro da API: ${result.error.message || 'Erro desconhecido da API Gemini.'}</p>`;
                console.error('Erro da API Gemini para Insights:', result.error);
            } else {
                insightsContentArea.innerHTML = '<p class="text-red-500">Não foi possível gerar insights financeiros neste momento.</p>';
            }
        } catch (error) {
            insightsContentArea.innerHTML = `<p class="text-red-500">Erro ao comunicar com a IA para insights. ${error.message || 'Verifique sua conexão.'}</p>`;
            console.error('Erro ao chamar a API Gemini para Insights:', error);
        }
    }
    
    // --- Funções do Modal de Otimização de Orçamento com IA (NOVA) ---
    async function openBudgetOptimizationModal() {
        budgetOptimizationModal.classList.add('active');
        budgetOptimizationText.innerHTML = '';
        budgetOptimizationLoadingIndicator.classList.remove('hidden');

        const validKeys = geminiApiKeys.filter(key => key && key.trim() !== '');
        if (!isGeminiApiReady || validKeys.length === 0) {
            budgetOptimizationText.innerHTML = '<p class="text-red-500">O assistente de IA não está configurado. Por favor, insira sua chave da API Gemini nas "Mais Opções".</p>';
            budgetOptimizationLoadingIndicator.classList.add('hidden');
            return;
        }

        let budgetDataString = "";
        if (budgets.length > 0) {
            budgetDataString += "<strong>Orçamentos configurados:</strong><br><br>";
            budgets.forEach(budget => {
                const category = categories.find(c => c.id === budget.categoryId);
                const categoryName = category ? category.name : 'Categoria Desconhecida';
                const actualSpent = transactions.filter(t => 
                    t.categoryId === budget.categoryId && t.type === 'expense' && (t.status === 'Pago')
                ).reduce((sum, t) => sum + parseFloat(t.amount), 0);
                const remaining = budget.amount - actualSpent; // Use budget.amount
                budgetDataString += `- Categoria: ${categoryName}, Orçado: ${formatCurrency(budget.amount)}, Gasto Real: ${formatCurrency(actualSpent)}, Saldo: ${formatCurrency(remaining)}<br>`;
            });
        } else {
            budgetDataString += "Nenhum orçamento configurado. Por favor, configure alguns orçamentos para obter sugestões.<br>";
        }
        budgetDataString += "<br>--- Fim dos Dados de Orçamento ---<br><br>";

        const optimizationPrompt =
            `Com base nos seguintes dados de orçamento do usuário, forneça sugestões claras e acionáveis para otimizar os gastos e gerenciar melhor o dinheiro. ` +
            `Seja direto, prático e objetivo, como um consultor financeiro que não hesita em apontar onde o usuário pode melhorar. ` +
            `Use títulos em negrito (<strong>), listas não ordenadas (<ul>, <li>) e quebras de linha (<br>). ` +
            `NUNCA use Markdown (*, **, _, #, etc.). ` +
            `Aqui estão os dados: <br><br>${budgetDataString}`;

        const payload = {
            contents: [{ role: "user", parts: [{ text: optimizationPrompt }] }],
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 800
            },
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
            ]
        };

        try {
            const result = await tryNextApiKey(payload);
            
            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0 && result.candidates[0].content.parts[0].text) {
                const aiResponseText = result.candidates[0].content.parts[0].text;
                budgetOptimizationText.innerHTML = aiResponseText;
            } else if (result.error) {
                budgetOptimizationText.innerHTML = `<p class="text-red-500">Erro da API: ${result.error.message || 'Erro desconhecido da API Gemini.'}</p>`;
                console.error('Erro da API Gemini para Otimização de Orçamento:', result.error);
            } else {
                budgetOptimizationText.innerHTML = '<p class="text-red-500">Não foi possível gerar sugestões de otimização de orçamento neste momento.</p>';
            }
        } catch (error) {
            budgetOptimizationText.innerHTML = `<p class="text-red-500">Erro ao comunicar com a IA para otimização. ${error.message || 'Verifique sua conexão.'}</p>`;
            console.error('Erro ao chamar a API Gemini para Otimização de Orçamento:', error);
        } finally {
            budgetOptimizationLoadingIndicator.classList.add('hidden');
        }
    }

    function closeBudgetOptimizationModal() {
        budgetOptimizationModal.classList.remove('active');
    }

    // --- Funções do Modal de Chave de API ---
    function openApiKeysModal() {
        apiKeysModal.classList.add('active');
        // As chaves serão carregadas automaticamente pelo onSnapshot em loadAllDataFromFirestore
        // e os modalApiKeyInputs.value serão atualizados por ele.
    }

    function closeApiKeysModal() {
        apiKeysModal.classList.remove('active');
    }

    function updateApiModalStatus(message, type = 'info') {
        apiModalStatusMessageDiv.classList.remove('hidden', 'bg-blue-100', 'border-blue-500', 'text-blue-700', 'bg-green-100', 'border-green-500', 'text-green-700', 'bg-red-100', 'border-red-500', 'text-red-700');
        
        if (type === 'info') {
            apiModalStatusMessageDiv.classList.add('bg-blue-100', 'border-blue-500', 'text-blue-700');
        } else if (type === 'success') {
            apiModalStatusMessageDiv.classList.add('bg-green-100', 'border-green-500', 'text-green-700');
        } else if (type === 'error') {
            apiModalStatusMessageDiv.classList.add('bg-red-100', 'border-red-500', 'text-red-700');
        }
        
        apiModalMessageText.textContent = message;
        apiModalStatusMessageDiv.classList.remove('hidden');

        setTimeout(() => {
            apiModalStatusMessageDiv.classList.add('hidden');
        }, 5000);
    }

    // --- Configuração e Inicialização do Firebase ---
    async function initializeFirebase() {
        try {
            app = initializeApp(firebaseConfig);
            db = getFirestore(app);
            auth = getAuth(app);
            console.log("Firebase Config usada:", firebaseConfig);
            console.log("Initial Auth Token:", initialAuthToken);

            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    // Usuário está logado (seja por token, e-mail/senha, ou sessão anterior)
                    userId = user.uid;
                    isAuthReady = true;
                    loginScreen.classList.add('hidden');
                    console.log("Usuário autenticado:", userId);
                    await loadAllDataFromFirestore();
                    // Lógica para decidir entre splash e app content
                    if (window.getComputedStyle(splashScreen).display !== 'none') {
                        showSplashScreen(); 
                    } else {
                        // Se splash estiver oculto (desktop), mostra o app direto
                        appContent.classList.remove('hidden');
                        showPage('dashboard');
                    }
                } else {
                    // Nenhum usuário logado
                    userId = null;
                    isAuthReady = false;
                    splashScreen.classList.add('hidden');
                    appContent.classList.add('hidden');
                    loginScreen.classList.remove('hidden'); // MOSTRA A TELA DE LOGIN
                    console.log("Usuário não autenticado. Mostrando tela de login.");
                }
            });

            // Tenta logar com token apenas se ele existir E NÃO HOUVER um usuário corrente
            if (initialAuthToken && !auth.currentUser) {
                try {
                    await signInWithCustomToken(auth, initialAuthToken);
                    console.log("Autenticação com token inicial bem-sucedida.");
                } catch (error) {
                    console.error("Falha na autenticação com o token inicial.", error);
                    let errorMessage = `Erro de autenticação: ${error.message}.`;
                    if (error.code === 'auth/custom-token-mismatch' || error.code === 'auth/invalid-custom-token') {
                        errorMessage += " Verifique as configurações do Firebase ou gere um novo token.";
                    }
                    loginErrorMessage.textContent = errorMessage;
                    loginErrorMessage.classList.remove('hidden');
                }
            } else if (!auth.currentUser) {
                 // Não faz nada se não houver token e nenhum usuário. O login será exibido pelo onAuthStateChanged.
                console.log("Nenhum token inicial e nenhum usuário logado. Aguardando interação.");
            }

        } catch (error) {
            console.error("Erro ao inicializar Firebase:", error);
            loginErrorMessage.textContent = `Erro crítico ao iniciar a aplicação: ${error.message}`;
            loginErrorMessage.classList.remove('hidden');
        }
    }

    // Event listener para o formulário de login
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = loginEmailInput.value;
            const password = loginPasswordInput.value;
            try {
                await signInWithEmailAndPassword(auth, email, password);
                loginErrorMessage.classList.add('hidden'); // Limpa a mensagem de erro se o login for bem-sucedido
            } catch (error) {
                let message = 'Erro ao fazer login. Verifique o seu e-mail e palavra-passe.';
                if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                    message = 'E-mail ou palavra-passe inválidos.';
                } else if (error.code === 'auth/invalid-email') {
                    message = 'Formato de e-mail inválido.';
                } else if (error.code === 'auth/operation-not-allowed') {
                    message = 'A operação de login por e-mail/palavra-passe não está ativada no seu projeto Firebase.';
                }
                loginErrorMessage.textContent = message;
                loginErrorMessage.classList.remove('hidden');
                console.error("Erro de login:", error.message, error.code);
            }
        });
    }

    // Event listener para o botão de logout (desktop)
    if (logoutButtonDesktop) {
        logoutButtonDesktop.addEventListener('click', async () => {
            try {
                await signOut(auth);
                console.log("Utilizador desconectado com sucesso.");
                // UI will be handled by onAuthStateChanged listener
            } catch (error) {
                console.error("Erro ao desconectar:", error.message);
            }
        });
    }

    // Carregar a página inicial (dashboard) ao carregar (inicialmente oculto até logar)
    // showPage('dashboard'); // Esta chamada será feita dentro do onAuthStateChanged

    // Atualizar o estado do chat ao carregar a página
    updateChatUIState();
    
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault(); 
            const pageId = e.currentTarget.dataset.page;
            showPage(pageId);
        });
    });

    // Event listeners para o chat
    if (sendButton) {
        sendButton.addEventListener('click', () => sendChatMessage(chatInput.value));
    }
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendChatMessage(chatInput.value);
            }
        });
    }
    // Event listener para o novo botão de atualizar dados do chat
    if (refreshChatDataButton) {
        refreshChatDataButton.addEventListener('click', (e) => {
            e.preventDefault();
            chatHistory = []; 
            // Força a IA a pegar novos dados na próxima mensagem.
            sendChatMessage("Por favor, atualize os meus dados financeiros.");
            // Esconde o menu dropdown
            e.target.closest('.action-menu-dropdown').classList.add('hidden');
        });
    }
    
    if (clearChatButton) {
        clearChatButton.addEventListener('click', (e) => {
            e.preventDefault();
            chatMessagesDiv.innerHTML = '';
            chatHistory = []; // Limpa o histórico da sessão
            appendMessage('ai', 'Chat limpo. Como posso ajudar a começar de novo?', 'info');
             // Esconde o menu dropdown
            e.target.closest('.action-menu-dropdown').classList.add('hidden');
        });
    }

    // NOVO: Event listener para o botão de voltar do chat
    if (chatBackButton) {
        chatBackButton.addEventListener('click', () => {
            showPage('dashboard'); // Volta para a Visão Geral
        });
    }


    // Event listener para o novo botão de Gerar Insights Financeiros
    if (generateInsightsButton) {
        generateInsightsButton.addEventListener('click', generateFinancialInsights);
    }

    // Event listener para o novo botão de Otimizar Orçamento
    if (optimizeBudgetButton) {
        optimizeBudgetButton.addEventListener('click', openBudgetOptimizationModal);
    }

    // Event listeners do Modal de Otimização de Orçamento
    if (closeBudgetOptimizationModalButton) {
        closeBudgetOptimizationModalButton.addEventListener('click', closeBudgetOptimizationModal);
    }
    if (closeBudgetOptimizationButton) {
        closeBudgetOptimizationButton.addEventListener('click', closeBudgetOptimizationModal);
    }


    // Função para atualizar o estado da UI do chat (habilitado/desabilitado)
    function updateChatUIState() {
        const hasValidKey = geminiApiKeys.some(key => key.trim() !== '');
        if (hasValidKey) {
            isGeminiApiReady = true;
            chatInput.disabled = false;
            sendButton.disabled = false;
            refreshChatDataButton.disabled = false;
            chatInput.placeholder = "Digite a sua mensagem...";
            // Verifica se a mensagem de "insira a sua chave" ainda está presente e a remove
            const initialAiMessage = chatMessagesDiv.querySelector('.flex.justify-start .bg-gray-100');
            if (initialAiMessage && initialAiMessage.textContent.includes('Por favor, insira sua chave')) {
                chatMessagesDiv.innerHTML = ''; // Limpa a div de mensagens
                appendMessage('ai', 'Assistente de IA pronto! Como posso ajudar?', 'info');
            }
            updateActiveApiKeyIndicator(); // Mostra o indicador
        } else {
            isGeminiApiReady = false;
            chatInput.disabled = true;
            sendButton.disabled = true;
            refreshChatDataButton.disabled = true;
            chatInput.placeholder = "Assistente não configurado...";
            activeApiKeyIndicator.classList.add('hidden'); // Esconde o indicador
        }
    }


    // Event listeners do Modal de Categoria
    if (addCategoryButton) {
        addCategoryButton.addEventListener('click', () => openCategoryModal());
    }
    if (closeCategoryModalButton) {
        closeCategoryModalButton.addEventListener('click', closeCategoryModal);
    }
    if (cancelCategoryButton) {
        cancelCategoryButton.addEventListener('click', closeCategoryModal);
    }

    // Event listeners do Modal de Transação e FAB
    if (fabButton) {
        fabButton.addEventListener('click', () => openTransactionModal());
    }
    if (closeTransactionModalButton) {
        closeTransactionModalButton.addEventListener('click', closeTransactionModal);
    }
    // Listener para os botões da Etapa 1
    document.querySelectorAll('.step-1-type-button').forEach(button => {
        button.addEventListener('click', () => {
            const type = button.dataset.type;

            // Se o tipo for 'adjust', abre o modal de ajuste e para a execução
            if (type === 'adjust') {
                openBalanceAdjustmentModal();
                closeTransactionModal(); // Fecha o modal de transação que foi aberto
                return;
            }

            // Remove a classe 'selected' de todos os botões e adiciona ao clicado
            document.querySelectorAll('.step-1-type-button').forEach(btn => btn.classList.remove('selected'));
            button.classList.add('selected');

            // Marca o radio oculto correspondente
            document.querySelector(`input[name="transaction-type"][value="${type}"]`).checked = true;
                    
            // Atualiza o título e as categorias da Etapa 2
            const titleMap = {
                income: 'Nova Receita',
                expense: 'Nova Despesa',
                deposit: 'Guardar Dinheiro',
                withdraw: 'Resgatar Dinheiro'
            };
            step2Title.textContent = titleMap[type];
            populateTransactionCategories(type);
                    
            goToStep(2);
        });
    });
    // Listeners para os botões "Continuar"
    document.querySelectorAll('.step-next-button').forEach(button => {
        button.addEventListener('click', () => {
            goToStep(currentStep + 1, true); // Preserve state when moving forward
        });
    });
    // Listeners para os botões "Voltar"
    document.querySelectorAll('.step-back-button').forEach(button => {
        button.addEventListener('click', () => {
            goToStep(currentStep - 1, true); // Preserve state when moving back
        });
    });
    // Listener para o botão de cancelar da Etapa 1
    document.getElementById('cancel-transaction-button-step1').addEventListener('click', closeTransactionModal);


    // Event listeners do Modal de Chave de API
    if (apiManagementLink) {
        apiManagementLink.addEventListener('click', (e) => {
            e.preventDefault();
            openApiKeysModal();
        });
    }
    if (closeApiKeysModalButton) {
        closeApiKeysModalButton.addEventListener('click', closeApiKeysModal);
    }
    if (saveApiKeysModalButton) {
        saveApiKeysModalButton.addEventListener('click', saveApiKeys);
    }

    if (saveAiConfigButton) {
        saveAiConfigButton.addEventListener('click', saveAiConfig);
    }
    
    transactionDateInput.valueAsDate = new Date();

    // Event listeners para o novo modal de orçamento
    if(configureBudgetButton) configureBudgetButton.addEventListener('click', () => openBudgetModal());
    if(closeBudgetModalButton) closeBudgetModalButton.addEventListener('click', closeBudgetModal);
    if(cancelBudgetButton) cancelBudgetButton.addEventListener('click', closeBudgetModal);
    if(budgetAmountInput) budgetAmountInput.addEventListener('input', () => formatCurrencyInput(budgetAmountInput));

    if(budgetForm) {
        budgetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = budgetIdInput.value;
            const categoryId = budgetCategorySelect.value;
            const amount = parseFloat(budgetAmountInput.value.replace(/\./g, '').replace(',', '.'));
            
            if (!categoryId || isNaN(amount) || amount <= 0) {
                showConfirmationModal("Erro de Validação", "Por favor, selecione uma categoria e insira um valor válido.", () => {});
                return;
            }

            // Verifica se já existe um orçamento para a categoria no mês atual, se não for edição
            if (!id) {
                const isAlreadyBudgeted = budgets.some(b => b.categoryId === categoryId && b.month === getCurrentMonthYYYYMM(currentMonth)); // Usa currentMonth
                if (isAlreadyBudgeted) {
                    showConfirmationModal("Orçamento Existente", "Já existe um orçamento para esta categoria neste mês. Por favor, edite o orçamento existente ou selecione outra categoria.", () => {});
                    return;
                }
            }

            if (id) { // Editando
                const index = budgets.findIndex(b => b.id === id);
                if (index !== -1) {
                    budgets[index].amount = amount;
                }
            } else { // Criando
                const newBudget = {
                    id: generateUUID(),
                    categoryId: categoryId,
                    amount: amount,
                    month: getCurrentMonthYYYYMM(currentMonth) // Usa currentMonth
                };
                budgets.push(newBudget);
            }
            await saveBudgets(); // Função que salva o array 'budgets' no Firestore
            showToast("Orçamento salvo com sucesso!", "success");
            closeBudgetModal();
        });
    }


    // Adicione delegação de eventos para os botões de editar/excluir orçamentos
    budgetListContainer.addEventListener('click', (e) => {
        const editButton = e.target.closest('.edit-budget-button');
        if (editButton) {
            const id = editButton.dataset.id;
            const budgetToEdit = budgets.find(b => b.id === id);
            if (budgetToEdit) {
                openBudgetModal(budgetToEdit);
            }
        }
        const deleteButton = e.target.closest('.delete-budget-button');
        if (deleteButton) {
            const id = deleteButton.dataset.id;
            showConfirmationModal('Excluir Orçamento', 'Tem certeza que deseja excluir este orçamento?', async () => {
                budgets = budgets.filter(b => b.id !== id);
                await saveBudgets();
            });
        }
    });

    // --- Funções e Listeners de Filtros (NOVO) ---
    function renderFilterPills() {
        filterPillsContainer.innerHTML = ''; // Limpa os filtros existentes
    
        const filterGroups = {
            type: [
                { label: 'Receitas', value: 'income' },
                { label: 'Despesas', value: 'expense' },
            ],
            status: [
                { label: 'Pagos', value: 'Pago' },
                { label: 'Recebidos', value: 'Recebido' },
                { label: 'Pendentes', value: 'Pendente' }
            ],
            // NOVO GRUPO PARA O FILTRO "VER TUDO"
            view: [
                { label: 'Ver Tudo', value: 'show-all' }
            ]
        };
    
        // Cria os botões para 'type'
        filterGroups.type.forEach((filter) => {
            const pill = document.createElement('button');
            pill.className = 'filter-pill';
            pill.textContent = filter.label;
            pill.dataset.value = filter.value;
            pill.dataset.filterGroup = 'type';
            filterPillsContainer.appendChild(pill);
        });
    
        // Cria um separador visual
        let separator = document.createElement('div');
        separator.className = 'filter-separator';
        filterPillsContainer.appendChild(separator);
    
        // Cria os botões para 'status'
        filterGroups.status.forEach((filter) => {
            const pill = document.createElement('button');
            pill.className = 'filter-pill';
            pill.textContent = filter.label;
            pill.dataset.value = filter.value;
            pill.dataset.filterGroup = 'status';
            filterPillsContainer.appendChild(pill);
        });
        
        // NOVO: Adiciona separador e o botão "Ver Tudo"
        separator = document.createElement('div');
        separator.className = 'filter-separator';
        filterPillsContainer.appendChild(separator);
        
        filterGroups.view.forEach((filter) => {
            const pill = document.createElement('button');
            pill.className = 'filter-pill';
            pill.textContent = filter.label;
            pill.dataset.value = filter.value;
            pill.dataset.filterGroup = 'view';
            filterPillsContainer.appendChild(pill);
        });
    }
    
    function populateFilterCategories() {
        const savedValue = filterCategorySelect.value;
        filterCategorySelect.innerHTML = '<option value="all">Todas as Categorias</option>';
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            filterCategorySelect.appendChild(option);
        });
        filterCategorySelect.value = savedValue;
    }
    
    // Delegação de evento para os botões de filtro
    filterPillsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('filter-pill')) {
            const pill = e.target;
            const group = pill.dataset.filterGroup;
            
            // Lógica para deselecionar
            if (pill.classList.contains('active')) {
                pill.classList.remove('active');
            } else {
                // Se o grupo for "view" (Ver Tudo), só permite um ativo. Se for outro grupo, também
                document.querySelectorAll(`.filter-pill[data-filter-group="${group}"]`).forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
            }

            // Se o botão "Ver Tudo" for ativado, desativa os outros filtros de tipo e status
            if (group === 'view' && pill.classList.contains('active')) {
                document.querySelectorAll(`.filter-pill[data-filter-group="type"], .filter-pill[data-filter-group="status"]`).forEach(p => p.classList.remove('active'));
            } else if (group === 'type' || group === 'status') {
                // Se qualquer outro filtro for ativado, desativa o "Ver Tudo"
                document.querySelector('.filter-pill[data-value="show-all"]')?.classList.remove('active');
            }

            updateMonthDisplay(); // Atualiza a UI do seletor de mês
            renderTransactions(); // Re-renderiza a lista de transações com o novo filtro
        }
    });
    
    filterCategorySelect.addEventListener('change', renderTransactions);
    
    renderFilterPills(); // Chama a função para criar os filtros iniciais


    // ABRIR/FECHAR MENUS DE AÇÃO (3 PONTOS)
    document.addEventListener('click', (e) => {
        const menuButton = e.target.closest('.action-menu-button');

        // Se o clique foi EM UM botão de menu
        if (menuButton) {
            e.stopPropagation();
            const dropdown = menuButton.nextElementSibling;
            
            // Fecha todos os outros dropdowns abertos antes de abrir o novo
            document.querySelectorAll('.action-menu-dropdown').forEach(openDropdown => {
                if (openDropdown !== dropdown) {
                    openDropdown.classList.add('hidden');
                }
            });
            // Alterna a visibilidade do dropdown clicado
            dropdown.classList.toggle('hidden');
        } else {
            // Se o clique foi FORA de qualquer botão de menu, fecha todos os dropdowns
            document.querySelectorAll('.action-menu-dropdown').forEach(dropdown => {
                if(dropdown && !dropdown.classList.contains('hidden')) {
                    dropdown.classList.add('hidden');
                }
            });
        }
    });



    // --- Funções de Gráfico (REESTRUTURADO) ---
    function updateChartMonthDisplay() {
        const displayValue = currentChartType === 'line' ? 'evolution' : chartMonth;
        currentMonthChartDisplay.textContent = formatMonthDisplay(displayValue);
    }
    
    function renderChart() {
        // Esconde a legenda e o total se não for o gráfico de pizza
        const legendContainer = document.getElementById('chart-legend-container');
        if (currentChartType !== 'pie') {
            legendContainer.classList.add('hidden');
        } else {
            legendContainer.classList.remove('hidden');
        }

        switch (currentChartType) {
            case 'pie':
                renderExpensePieChart();
                break;
            case 'bar':
                renderIncomeVsExpenseBarChart();
                break;
            case 'line':
                renderBalanceEvolutionLineChart();
                break;
            default:
                renderExpensePieChart();
        }
        updateChartMonthDisplay();
    }
    
    function renderExpensePieChart() {
        const ctx = document.getElementById('expense-chart').getContext('2d');
        const legendDiv = document.getElementById('chart-legend');
        const totalAmountSpan = document.getElementById('chart-total-amount');
        const centerTextDiv = document.getElementById('chart-center-text');

        legendDiv.innerHTML = '';
        totalAmountSpan.textContent = formatCurrency(0);
        centerTextDiv.innerHTML = '';

        const expensesByCategory = transactions
            .filter(t => t.type === 'expense' && t.date.startsWith(getCurrentMonthYYYYMM(chartMonth)) && t.status === 'Pago')
            .reduce((acc, t) => {
                const category = categories.find(c => c.id === t.categoryId);
                const categoryName = category ? category.name : 'Sem Categoria';
                const categoryColor = category ? category.color : '#808080';
                if (!acc[categoryName]) {
                    acc[categoryName] = { total: 0, color: categoryColor };
                }
                acc[categoryName].total += parseFloat(t.amount);
                return acc;
            }, {});

        const sortedExpenses = Object.entries(expensesByCategory).sort(([, a], [, b]) => b.total - a.total);
        const totalExpenses = sortedExpenses.reduce((sum, [, data]) => sum + data.total, 0);

        const labels = sortedExpenses.map(([name]) => name);
        const data = sortedExpenses.map(([, data]) => data.total);
        const backgroundColors = sortedExpenses.map(([, data]) => data.color);

        if (expenseChartInstance) {
            expenseChartInstance.destroy();
        }

        if (labels.length === 0) {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.font = '16px "Inter", sans-serif';
            ctx.fillStyle = '#6B7280';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Sem despesas pagas para exibir neste mês.', ctx.canvas.width / 2, ctx.canvas.height / 2);
            legendDiv.innerHTML = '<p class="text-center text-gray-500">Sem dados para a legenda.</p>';
            totalAmountSpan.textContent = formatCurrency(0);
            return;
        }

        // Preenche a legenda customizada
        sortedExpenses.forEach(([name, catData]) => {
            const percentage = totalExpenses > 0 ? (catData.total / totalExpenses * 100).toFixed(2) : 0;
            const legendItem = document.createElement('div');
            legendItem.className = 'chart-legend-item';
            legendItem.innerHTML = `
                <div class="flex items-center">
                    <span class="w-3 h-3 rounded-full mr-3" style="background-color: ${catData.color};"></span>
                    <span class="flex-grow text-sm text-gray-700">${name}</span>
                </div>
                <div class="text-right">
                    <span class="font-semibold text-sm">${formatCurrency(catData.total)}</span>
                    <span class="text-xs text-gray-500 w-16 inline-block text-right">${percentage.replace('.', ',')}%</span>
                </div>
            `;
            legendDiv.appendChild(legendItem);
        });

        // Atualiza o total
        totalAmountSpan.textContent = formatCurrency(totalExpenses);

        // Atualiza o texto central com a maior despesa
        const largestExpense = sortedExpenses[0];
        const largestExpensePercentage = totalExpenses > 0 ? (largestExpense[1].total / totalExpenses * 100).toFixed(2) : 0;
        centerTextDiv.innerHTML = `
            <div class="text-xl font-bold text-red-500">${largestExpensePercentage.replace('.', ',')}%</div>
            <div class="text-sm text-gray-600">${largestExpense[0]}</div>
        `;

        expenseChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Despesas por Categoria',
                    data: data,
                    backgroundColor: backgroundColors,
                    borderColor: '#fff',
                    borderWidth: 2,
                    hoverBorderWidth: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%', // Cria o efeito de "rosca"
                plugins: {
                    legend: {
                        display: false // Desativa a legenda padrão do Chart.js
                    },
                    tooltip: {
                        enabled: false // Desativa o tooltip padrão para usar a legenda customizada
                    }
                }
            }
        });
    }

    function renderIncomeVsExpenseBarChart() {
        const ctx = document.getElementById('expense-chart').getContext('2d');
        document.getElementById('chart-center-text').innerHTML = ''; // Limpa o texto central
        const monthFilter = getCurrentMonthYYYYMM(chartMonth);

        const totalIncome = transactions
            .filter(t => t.type === 'income' && t.date.startsWith(monthFilter) && t.status === 'Recebido')
            .reduce((sum, t) => sum + parseFloat(t.amount), 0);

        const totalExpense = transactions
            .filter(t => t.type === 'expense' && t.date.startsWith(monthFilter) && t.status === 'Pago')
            .reduce((sum, t) => sum + parseFloat(t.amount), 0);

        if (expenseChartInstance) {
            expenseChartInstance.destroy();
        }
        
        expenseChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Receitas', 'Despesas'],
                datasets: [{
                    label: 'Total no Mês',
                    data: [totalIncome, totalExpense],
                    backgroundColor: [
                        'rgba(75, 192, 192, 0.6)',
                        'rgba(255, 99, 132, 0.6)'
                    ],
                    borderColor: [
                        'rgba(75, 192, 192, 1)',
                        'rgba(255, 99, 132, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `${context.label || ''}: ${formatCurrency(context.raw)}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => formatCurrency(value)
                        }
                    }
                }
            }
        });
    }
    
    function renderBalanceEvolutionLineChart() {
        const ctx = document.getElementById('expense-chart').getContext('2d');
        document.getElementById('chart-center-text').innerHTML = ''; // Limpa o texto central
        const balances = [];
        const labels = [];
        let cumulativeBalance = 0;
    
        // 1. Calcular o saldo inicial antes dos últimos 6 meses
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const sixMonthsAgoYYYYMM = getCurrentMonthYYYYMM(sixMonthsAgo);
    
        let initialBalance = 0;
        transactions.forEach(t => {
            const transactionMonth = t.date.substring(0, 7);
            if (transactionMonth < sixMonthsAgoYYYYMM && (t.status === 'Pago' || t.status === 'Recebido' || t.status === 'Confirmado')) {
                if (t.type === 'income') initialBalance += parseFloat(t.amount);
                if (t.type === 'expense') initialBalance -= parseFloat(t.amount);
                if (t.type === 'caixinha') {
                    if (t.transactionType === 'deposit') initialBalance -= parseFloat(t.amount);
                    if (t.transactionType === 'withdraw') initialBalance += parseFloat(t.amount);
                }
            }
        });
    
        cumulativeBalance = initialBalance;
    
        // 2. Calcular o saldo final para cada um dos últimos 6 meses
        for (let i = 5; i >= 0; i--) {
            const date = new Date();
            date.setMonth(date.getMonth() - i);
            const monthYYYYMM = getCurrentMonthYYYYMM(date);
            
            const monthIncome = transactions
                .filter(t => t.date.startsWith(monthYYYYMM) && t.type === 'income' && t.status === 'Recebido')
                .reduce((sum, t) => sum + parseFloat(t.amount), 0);
            
            const monthExpense = transactions
                .filter(t => t.date.startsWith(monthYYYYMM) && t.type === 'expense' && t.status === 'Pago')
                .reduce((sum, t) => sum + parseFloat(t.amount), 0);

            const monthCaixinhaNet = transactions
                .filter(t => t.date.startsWith(monthYYYYMM) && t.type === 'caixinha' && t.status === 'Confirmado')
                .reduce((sum, t) => {
                    if (t.transactionType === 'deposit') return sum - parseFloat(t.amount);
                    if (t.transactionType === 'withdraw') return sum + parseFloat(t.amount);
                    return sum;
                }, 0);
    
            cumulativeBalance += monthIncome - monthExpense + monthCaixinhaNet;
            balances.push(cumulativeBalance);
            labels.push(date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }));
        }

        if (expenseChartInstance) {
            expenseChartInstance.destroy();
        }

        expenseChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Saldo Acumulado',
                    data: balances,
                    fill: false,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => `Saldo: ${formatCurrency(context.raw)}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        ticks: {
                            callback: (value) => formatCurrency(value)
                        }
                    }
                }
            }
        });
    }

    // --- Listeners do Gráfico Interativo ---
    chartTypeSelector.addEventListener('click', (e) => {
        const button = e.target.closest('.chart-type-button');
        if (!button) return;

        currentChartType = button.dataset.chartType;

        // Atualiza a classe 'active' nos botões
        document.querySelectorAll('.chart-type-button').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        // Habilita/desabilita a navegação de mês
        const monthNavDisabled = currentChartType === 'line';
        prevMonthChartButton.disabled = monthNavDisabled;
        nextMonthChartButton.disabled = monthNavDisabled;
        if(monthNavDisabled) {
             prevMonthChartButton.classList.add('opacity-50', 'cursor-not-allowed');
             nextMonthChartButton.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
             prevMonthChartButton.classList.remove('opacity-50', 'cursor-not-allowed');
             nextMonthChartButton.classList.remove('opacity-50', 'cursor-not-allowed');
        }

        renderChart();
    });
    
    prevMonthChartButton.addEventListener('click', () => {
        chartMonth.setMonth(chartMonth.getMonth() - 1);
        renderChart();
    });

    nextMonthChartButton.addEventListener('click', () => {
        chartMonth.setMonth(chartMonth.getMonth() + 1);
        renderChart();
    });

    // Listener para o novo botão de adicionar categoria rápido
    addCategoryQuickButton.addEventListener('click', () => {
        // Abre o modal de categoria, mas não passa nenhum objeto, então ele abre em modo de adição
        openCategoryModal();
        // Pré-seleciona o tipo de categoria com base no tipo de transação que o usuário está criando
        const selectedTransactionType = document.querySelector('input[name="transaction-type"]:checked').value;
        let categoryTypeToSelect = selectedTransactionType;
        if (selectedTransactionType === 'deposit' || selectedTransactionType === 'withdraw') {
            categoryTypeToSelect = 'caixinha';
        }
        const categoryRadio = document.querySelector(`input[name="category-type"][value="${categoryTypeToSelect}"]`);
        if (categoryRadio) {
            categoryRadio.checked = true;
            // Dispara o evento 'change' para garantir que a UI do modal de categoria se atualize
            categoryRadio.dispatchEvent(new Event('change'));
        }
    });
    
    // --- Funções de Otimização de Categoria com IA ---
    function closeCategoryOptimizationModal() {
        categoryOptimizationModal.classList.remove('active');
    }

    async function openCategoryOptimizationModal() {
        categoryOptimizationModal.classList.add('active');
        categoryOptimizationSuggestions.innerHTML = '';
        categoryOptimizationLoadingIndicator.classList.remove('hidden');

        const validKeys = geminiApiKeys.filter((key) => key && key.trim() !== "");
        if (!isGeminiApiReady || validKeys.length === 0) {
            categoryOptimizationSuggestions.innerHTML = '<p class="text-red-500">O assistente de IA não está configurado.</p>';
            categoryOptimizationLoadingIndicator.classList.add('hidden');
            return;
        }

        const categoryAndTransactionData = categories.map(cat => {
            const associatedTransactions = transactions
                .filter(t => t.categoryId === cat.id)
                .map(t => t.description)
                .slice(0, 5); // Limita a 5 descrições por performance
            return {
                id: cat.id,
                name: cat.name,
                type: cat.type,
                transactionCount: associatedTransactions.length,
                sampleDescriptions: associatedTransactions
            };
        });

        const prompt = `
            Você é um organizador financeiro especialista. Analise a lista de categorias e transações de um usuário.
            Seu objetivo é sugerir melhorias para manter as categorias organizadas e claras.
            Responda com um array de objetos JSON, onde cada objeto é uma sugestão.
            
            As sugestões podem ser dos seguintes tipos: 'merge', 'rename', 'delete'.

            Estrutura da resposta:
            [
              {
                "type": "merge",
                "from": ["Nome Categoria A", "Nome Categoria B"],
                "to": "Nome Sugerido para a Nova Categoria",
                "reason": "Justificativa curta para a sugestão."
              },
              {
                "type": "rename",
                "from": "Nome Categoria Antiga",
                "to": "Novo Nome Sugerido",
                "reason": "Justificativa curta para a sugestão."
              },
              {
                "type": "delete",
                "from": "Nome Categoria",
                "reason": "Justificativa curta (ex: Sem uso e sem transações)."
              }
            ]

            REGRAS:
            1.  Mescle categorias que são muito similares (ex: "Táxi" e "Uber").
            2.  Renomeie categorias com nomes pouco claros ou com abreviações (ex: "Transp." para "Transporte").
            3.  Sugira apagar apenas categorias sem transações associadas.
            4.  Se não houver sugestões, retorne um array vazio [].
            5.  Foque em sugestões de alto impacto. Não sugira muitas mudanças de uma vez. Limite-se a um máximo de 5 sugestões.
            6.  Responda APENAS com o array JSON. Não inclua \`\`\`json ou qualquer outro texto.

            DADOS DO USUÁRIO:
            ${JSON.stringify(categoryAndTransactionData, null, 2)}
        `;

        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                response_mime_type: "application/json",
            },
        };

        try {
            const result = await tryNextApiKey(payload);
            if (!result.candidates || !result.candidates[0].content.parts[0].text) {
                throw new Error("Resposta da IA inválida ao otimizar categorias.");
            }
            const suggestions = JSON.parse(result.candidates[0].content.parts[0].text);
            categoryOptimizationSuggestionsStore = suggestions; // Armazena as sugestões
            renderCategoryOptimizationSuggestions(suggestions);
        } catch (error) {
            console.error("Erro ao otimizar categorias:", error);
            categoryOptimizationSuggestions.innerHTML = `<p class="text-red-500">Erro ao obter sugestões da IA. Tente novamente.</p>`;
        } finally {
            categoryOptimizationLoadingIndicator.classList.add('hidden');
        }
    }
    
    function renderCategoryOptimizationSuggestions(suggestions) {
        categoryOptimizationSuggestions.innerHTML = '';
        if (suggestions.length === 0) {
            categoryOptimizationSuggestions.innerHTML = '<p class="text-center text-gray-500 py-4">Nenhuma sugestão de otimização encontrada. Suas categorias estão bem organizadas!</p>';
            return;
        }

        suggestions.forEach((suggestion, index) => {
            const card = document.createElement('div');
            card.className = 'suggestion-card';
            let description = '';

            switch(suggestion.type) {
                case 'merge':
                    description = `Sugerimos mesclar as categorias <strong>${suggestion.from.join(', ')}</strong> na nova categoria <strong>"${suggestion.to}"</strong>.`;
                    break;
                case 'rename':
                    description = `Sugerimos renomear a categoria <strong>"${suggestion.from}"</strong> para <strong>"${suggestion.to}"</strong>.`;
                    break;
                case 'delete':
                     description = `Sugerimos apagar a categoria <strong>"${suggestion.from}"</strong>.`;
                    break;
            }

            card.innerHTML = `
                <p class="font-semibold text-gray-800">${suggestion.type.charAt(0).toUpperCase() + suggestion.type.slice(1)}</p>
                <p class="text-sm text-gray-600 mt-1">${description}</p>
                <p class="text-xs text-gray-500 mt-1"><em>Motivo: ${suggestion.reason}</em></p>
                <div class="suggestion-actions">
                    <button class="action-confirm" data-index="${index}" data-action="confirm">Confirmar</button>
                    <button class="action-ignore" data-index="${index}" data-action="ignore">Ignorar</button>
                </div>
            `;
            categoryOptimizationSuggestions.appendChild(card);
        });
    }


    optimizeCategoriesButton.addEventListener('click', openCategoryOptimizationModal);
    closeCategoryOptimizationModalButton.addEventListener('click', closeCategoryOptimizationModal);
    if (closeCategoryOptimizationButton) {
        closeCategoryOptimizationButton.addEventListener('click', closeCategoryOptimizationModal);
    }
    
    // Delegação de eventos para as ações de otimização de categoria
    categoryOptimizationSuggestions.addEventListener('click', async (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        const action = button.dataset.action;
        const index = parseInt(button.dataset.index, 10);
        const suggestion = categoryOptimizationSuggestionsStore[index];
        const card = button.closest('.suggestion-card');

        if (action === 'ignore') {
            card.remove(); // Simplesmente remove a sugestão da UI
            return;
        }

        if (action === 'confirm') {
            try {
                switch (suggestion.type) {
                    case 'merge':
                        await handleMergeSuggestion(suggestion);
                        break;
                    case 'rename':
                        await handleRenameSuggestion(suggestion);
                        break;
                    case 'delete':
                        await handleDeleteSuggestion(suggestion);
                        break;
                }
                card.remove(); // Remove o card após a ação ser bem-sucedida
                // Verifica se não há mais sugestões
                if (categoryOptimizationSuggestions.childElementCount === 0) {
                    categoryOptimizationSuggestions.innerHTML = '<p class="text-center text-green-600 font-semibold py-4">Todas as sugestões foram aplicadas!</p>';
                }
            } catch (error) {
                console.error(`Erro ao aplicar sugestão de ${suggestion.type}:`, error);
                showToast(`Falha ao aplicar sugestão: ${error.message}`, 'error');
            }
        }
    });

    async function handleMergeSuggestion(suggestion) {
        // Encontra as categorias a serem mescladas
        const categoriesToMerge = categories.filter(c => suggestion.from.includes(c.name));
        if (categoriesToMerge.length === 0) {
            throw new Error("Categorias para mesclar não encontradas.");
        }
    
        // Pega o tipo e a prioridade da primeira categoria como base (pode ser refinado se necessário)
        const baseCategory = categoriesToMerge[0];
    
        // Cria a nova categoria
        const newCategory = {
            id: generateUUID(),
            name: suggestion.to,
            type: baseCategory.type,
            priority: baseCategory.priority,
            color: getNextAvailableColor(baseCategory.type, baseCategory.priority),
            savedAmount: 0, // Zera para caixinhas, se aplicável
            targetAmount: 0
        };
        categories.push(newCategory);
    
        // Atualiza as transações
        const idsToMerge = categoriesToMerge.map(c => c.id);
        transactions.forEach(t => {
            if (idsToMerge.includes(t.categoryId)) {
                t.categoryId = newCategory.id;
            }
        });
    
        // Remove as categorias antigas
        categories = categories.filter(c => !idsToMerge.includes(c.id));
    
        await saveCategories();
        await saveAllTransactionsInBatch(); // Salva todas as transações modificadas de uma vez
        showToast(`Categorias mescladas em "${suggestion.to}"!`, 'success');
    }
    
    async function handleRenameSuggestion(suggestion) {
        const categoryToRename = categories.find(c => c.name === suggestion.from);
        if (!categoryToRename) {
            throw new Error(`Categoria "${suggestion.from}" não encontrada para renomear.`);
        }
        categoryToRename.name = suggestion.to;
        await saveCategories();
        showToast(`Categoria renomeada para "${suggestion.to}"!`, 'success');
    }
    
    async function handleDeleteSuggestion(suggestion) {
        const categoryToDelete = categories.find(c => c.name === suggestion.from);
        if (!categoryToDelete) {
            throw new Error(`Categoria "${suggestion.from}" não encontrada para apagar.`);
        }
    
        // A lógica da IA já deve ter garantido que não há transações.
        categories = categories.filter(c => c.id !== categoryToDelete.id);
        await saveCategories();
        showToast(`Categoria "${suggestion.from}" apagada!`, 'success');
    }

    async function saveAllTransactionsInBatch() {
        if (!isAuthReady || !userId) { return; }
        try {
            const batch = writeBatch(db);
            const transactionsColRef = getUserCollectionRef('transactions');
            if (!transactionsColRef) return;
    
            transactions.forEach(t => {
                const docRef = doc(transactionsColRef, t.id);
                batch.set(docRef, t, { merge: true });
            });
    
            await batch.commit();
            console.log("Lote de transações atualizado com sucesso!");
        } catch (error) {
            console.error("Erro ao salvar lote de transações:", error);
            showToast("Erro ao atualizar transações após mesclagem.", 'error');
        }
    }

    // Event listener para o botão "Continuar" da tela de Splash
    continueToAppButton.addEventListener('click', () => {
        splashScreen.classList.add('hidden');
        appContent.classList.remove('hidden');
        showPage('dashboard');
    });

    // --- NOVO: Funções de Análise de Despesas com IA ---
    function openExpenseParserModal() {
        expenseParserModal.classList.add('active');
        expenseParserInput.value = ''; // Limpa a área de texto
    }

    function closeExpenseParserModal() {
        expenseParserModal.classList.remove('active');
    }

    // NOVA FUNÇÃO: Processa o próximo item na fila de sugestões da IA
    async function processNextAISuggestion() {
        if (aiSuggestedExpensesQueue.length === 0) {
            showToast("Todas as despesas sugeridas foram processadas.", "success");
            return;
        }
    
        const expense = aiSuggestedExpensesQueue.shift(); // Pega o primeiro item e o remove da fila
        let categoryIdToSelect = null;
    
        // 1. Verifica se a categoria sugerida já existe.
        const existingCategory = categories.find(c =>
            c.name.toLowerCase() === expense.suggestedCategoryName.toLowerCase() && c.type === 'expense'
        );
    
        if (existingCategory) {
            categoryIdToSelect = existingCategory.id;
        } else {
            // 2. Se a categoria não existe, pergunta se o usuário quer criá-la.
            const userWantsToCreate = await new Promise(resolve => {
                showConfirmationModal(
                    "Nova Categoria Sugerida",
                    `A IA sugeriu uma nova categoria: "${expense.suggestedCategoryName}". Deseja criá-la?`,
                    () => resolve(true),  // Callback de sucesso
                    () => resolve(false) // Callback de cancelamento
                );
            });
    
            if (userWantsToCreate) {
                // Cria a nova categoria
                const newCategory = {
                    id: generateUUID(),
                    name: expense.suggestedCategoryName,
                    type: 'expense', // Assume despesa para este fluxo
                    priority: 'non-essential', // Padrão, o usuário pode editar depois
                    color: getNextAvailableColor('expense', 'non-essential')
                };
                categories.push(newCategory);
                await saveCategories();
                showToast(`Categoria "${newCategory.name}" criada!`, "success");
                categoryIdToSelect = newCategory.id;
            } else {
                // Se o usuário não quer criar, o campo de categoria ficará em branco
                showToast("Criação de categoria cancelada. Por favor, selecione uma manualmente.", "info");
            }
        }
    
        // 3. Abre o modal de transação, agora com o categoryId (se aplicável)
        openTransactionModal({
            type: 'expense',
            description: expense.description,
            amount: expense.amount,
            date: new Date().toISOString().split('T')[0],
            status: 'Pendente',
            categoryId: categoryIdToSelect // Passa o ID da categoria
        });
        // A continuação do fluxo ocorrerá após o salvamento da transação (submit do form)
    }

    async function parseExpensesWithAI(event) {
        event.preventDefault();
        const textToParse = expenseParserInput.value.trim();
        if (!textToParse) {
            showToast("Por favor, cole sua lista de despesas.", "info");
            return;
        }

        const validKeys = geminiApiKeys.filter((key) => key && key.trim() !== "");
        if (!isGeminiApiReady || validKeys.length === 0) {
            showToast("O assistente de IA não está configurado.", "error");
            return;
        }

        const button = analyzeExpensesButton;
        const buttonText = button.querySelector('span');
        const buttonIcon = button.querySelector('i');
        
        button.disabled = true;
        buttonText.textContent = 'Analisando...';
        buttonIcon.className = 'fa-solid fa-spinner animate-spin mr-2';

        const currentMonthTransactions = transactions.filter(t => t.date.startsWith(getCurrentMonthYYYYMM(currentMonth)));
        
        const existingExpenseCategories = categories
            .filter(c => c.type === 'expense')
            .map(c => ({ name: c.name, priority: c.priority }));

        const prompt = `
            Você é um assistente financeiro especialista em extrair e categorizar dados.
            Sua tarefa é analisar a lista de despesas fornecida pelo usuário, compará-la com as transações já existentes e, para cada despesa NOVA, sugerir a categoria mais apropriada.

            ESTRUTURA DA RESPOSTA (OBRIGATÓRIO):
            Responda APENAS com um array de objetos JSON. Cada objeto deve ter os seguintes campos:
            {
              "description": "string",
              "amount": number,
              "suggestedCategoryName": "string"
            }
            Se nenhuma nova despesa for encontrada, retorne um array vazio []. Não inclua \`\`\`json ou qualquer outro texto.

            REGRAS CRÍTICAS DE PROCESSAMENTO:
            1.  **Extração de Dados:** De cada linha do texto do usuário, extraia a descrição ('description') e o valor ('amount'). O valor deve ser um número (float), sem símbolos de moeda.
            2.  **Verificação de Duplicatas:** Compare CUIDADOSAMENTE cada despesa extraída com a lista de 'transacoes_existentes'. Se uma despesa com descrição e valor muito similares já existir, **IGNORE-A** e não a inclua no resultado.
            3.  **Sugestão de Categoria:** Para cada despesa NOVA, analise a 'description' e compare-a com a lista de 'categorias_existentes'.
                - Se a descrição se encaixa bem em uma categoria existente, use o nome exato dessa categoria em 'suggestedCategoryName'.
                - Se nenhuma categoria existente se encaixar bem, crie um nome de categoria novo, claro e conciso, para 'suggestedCategoryName'.
            
            ---
            DADOS FORNECIDOS PARA ANÁLISE:
            
            1.  LISTA DE DESPESAS DO USUÁRIO:
            ${textToParse}

            2.  TRANSAÇÕES JÁ EXISTENTES NO MÊS (PARA EVITAR DUPLICATAS):
            ${JSON.stringify(currentMonthTransactions.map(t => ({description: t.description, amount: t.amount})))}

            3.  CATEGORIAS DE DESPESA JÁ EXISTENTES (PARA SUGESTÃO):
            ${JSON.stringify(existingExpenseCategories)}
            ---
        `;

        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                response_mime_type: "application/json",
            },
        };

        try {
            const result = await tryNextApiKey(payload);
            if (!result.candidates || !result.candidates[0].content.parts[0].text) {
                throw new Error("Resposta da IA inválida ao analisar despesas.");
            }
            const newExpenses = JSON.parse(result.candidates[0].content.parts[0].text);
            
            closeExpenseParserModal();

            if (newExpenses.length === 0) {
                showToast("Nenhuma despesa nova encontrada para adicionar.", "info");
                return;
            }

            // Coloca as sugestões na fila e inicia o processamento
            aiSuggestedExpensesQueue = newExpenses;
            processNextAISuggestion();

        } catch (error) {
            console.error("Erro ao analisar despesas com IA:", error);
            showToast("Erro ao processar a lista. Verifique o formato e tente novamente.", "error");
        } finally {
            button.disabled = false;
            buttonText.textContent = 'Analisar com IA';
            buttonIcon.className = 'fa-solid fa-brain mr-2';
        }
    }


    expenseParserButton.addEventListener('click', openExpenseParserModal);
    closeExpenseParserModalButton.addEventListener('click', closeExpenseParserModal);
    expenseParserForm.addEventListener('submit', parseExpensesWithAI);

    // --- NOVO: Funções de Ajuste de Saldo ---
    function openBalanceAdjustmentModal() {
        balanceAdjustmentModal.classList.add('active');
        balanceAdjustmentForm.reset();
    }

    function closeBalanceAdjustmentModal() {
        balanceAdjustmentModal.classList.remove('active');
    }

    async function handleBalanceAdjustment(event) {
        event.preventDefault();
        const newBalanceFormatted = newBalanceAmountInput.value.replace(/\./g, '').replace(',', '.');
        const newBalance = parseFloat(newBalanceFormatted);

        if (isNaN(newBalance)) {
            showToast("Por favor, insira um valor de saldo válido.", "error");
            return;
        }

        const currentBalanceString = dashboardCurrentBalance.textContent.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
        const currentBalance = parseFloat(currentBalanceString);

        const difference = newBalance - currentBalance;

        if (Math.abs(difference) < 0.01) {
            showToast("O saldo informado é igual ao saldo atual. Nenhum ajuste necessário.", "info");
            closeBalanceAdjustmentModal();
            return;
        }

        const adjustmentType = difference > 0 ? 'income' : 'expense';
        const adjustmentAmount = Math.abs(difference);

        // Verifica se a categoria "Ajuste de Saldo" já existe
        let adjustmentCategory = categories.find(c => c.name === "Ajuste de Saldo" && c.type === adjustmentType);

        // Se não existir, cria uma
        if (!adjustmentCategory) {
            adjustmentCategory = {
                id: generateUUID(),
                name: "Ajuste de Saldo",
                type: adjustmentType,
                priority: null, // Ajustes não têm prioridade
                color: '#778899' // Uma cor neutra como cinza ardósia
            };
            categories.push(adjustmentCategory);
            await saveCategories(); // Salva a nova categoria no banco
        }

        // Cria a transação de ajuste
        const adjustmentTransaction = {
            id: generateUUID(),
            description: "Ajuste manual de saldo",
            amount: adjustmentAmount,
            date: new Date().toISOString().split('T')[0], // Data de hoje
            type: adjustmentType,
            categoryId: adjustmentCategory.id,
            status: adjustmentType === 'income' ? 'Recebido' : 'Pago' // Ajustes são sempre confirmados
        };

        await saveTransaction(adjustmentTransaction);

        showToast("Saldo ajustado com sucesso!", "success");
        closeBalanceAdjustmentModal();
    }

    if(adjustBalanceButtonChat) adjustBalanceButtonChat.addEventListener('click', openBalanceAdjustmentModal);
    if(closeBalanceAdjustmentModalButton) closeBalanceAdjustmentModalButton.addEventListener('click', closeBalanceAdjustmentModal);
    if(cancelAdjustmentButton) cancelAdjustmentButton.addEventListener('click', cancelAdjustmentButton);
    if(balanceAdjustmentForm) balanceAdjustmentForm.addEventListener('submit', handleBalanceAdjustment);
    if(newBalanceAmountInput) newBalanceAmountInput.addEventListener('input', () => formatCurrencyInput(newBalanceAmountInput));

    // --- NOVO: Event Listener para o Botão de Teste ---
    if (testNotificationButton) {
        testNotificationButton.addEventListener('click', (e) => {
            e.preventDefault();
            sendTestNotification();
        });
    }

});




