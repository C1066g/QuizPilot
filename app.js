// 应用程序主逻辑
let allQuestions = [];
let originalQuestions = []; // 保存原始题目列表，用于恢复
let currentIndex = 0;
let correctAnswers = 0;
let answeredQuestions = new Set();
let wrongQuestions = new Map(); // 错题集：存储错题ID和答案
let collectedQuestions = new Map(); // 收藏题目：存储收藏题目ID和信息
let startTime = Date.now();
let currentSubject = localStorage.getItem('currentSubject') || 'ai'; // 科目：ai / exchange / future
let currentFilter = 'all';
let currentSearchTerm = '';
let currentMode = 'practice';
let isReviewingWrong = false; // 标记是否在复习错题模式
let currentOptions = []; // 保存当前题目的选项顺序（用于乱序功能）
let originalOptions = []; // 保存原始选项顺序
let multiSelected = new Set(); // 多选题：当前已选择的选项字母集合
let autoAdvance = (localStorage.getItem('autoAdvance') || '1') === '1';

try { if (typeof window !== 'undefined' && window.pdfjsLib) { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js'; } } catch (e) {}

// 科目题库映射
const SUBJECTS = {
    ai: {
        name: '人工智能',
        getQuestions: () => [
            ...(typeof questionsPart1 !== 'undefined' ? questionsPart1 : []),
            ...(typeof questionsPart2 !== 'undefined' ? questionsPart2 : []),
            ...(typeof questionsPart3 !== 'undefined' ? questionsPart3 : []),
            ...(typeof questionsPart4 !== 'undefined' ? questionsPart4 : []),
        ]
    },
    exchange: {
        name: '现代交换原理',
        getQuestions: () => [
            ...(typeof questionsExchange !== 'undefined' ? questionsExchange : [])
        ]
    },
    linux: {
        name: 'Linux 技术应用',
        getQuestions: () => [
            ...(typeof questionsLinux !== 'undefined' ? questionsLinux : [])
        ]
    }
};

function refreshAfterOverlayChange() {
    allQuestions = SUBJECTS[currentSubject].getQuestions();
    originalQuestions = [...allQuestions];
    const proceed = () => {
        renderQuestionNav();
        showQuestion();
        updateStats();
    };
    applyOverlaysForSubject(currentSubject).then(proceed).catch(proceed);
}

// ================= Word/PDF/TXT 导入 =================
function importWordPdf() {
    const inp = document.getElementById('docFileInput');
    if (inp) inp.click();
}

async function handleWordPdfFileChange(e) {
    const file = e && e.target && e.target.files && e.target.files[0];
    if (!file) return;
    const name = file.name || '';
    const lower = name.toLowerCase();
    try {
        if (lower.endsWith('.txt') || lower.endsWith('.md')) {
            const text = await file.text();
            await importFromPlainText(text);
        } else if (lower.endsWith('.docx')) {
            if (typeof window.mammoth === 'undefined') {
                alert('当前离线环境未内置 Word 解析库。可先将 Word 另存为纯文本，或上传覆盖层 JSON。');
                return;
            }
            const arrayBuf = await file.arrayBuffer();
            const result = await window.mammoth.extractRawText({ arrayBuffer: arrayBuf });
            await importFromPlainText(result && result.value ? result.value : '');
        } else if (lower.endsWith('.pdf')) {
            if (typeof window.pdfjsLib === 'undefined') {
                alert('当前离线环境未内置 PDF 解析库。可先将 PDF 导出为纯文本，或上传覆盖层 JSON。');
                return;
            }
            const arrayBuf = await file.arrayBuffer();
            const pdf = await window.pdfjsLib.getDocument({ data: arrayBuf }).promise;
            let text = '';
            for (let p = 1; p <= pdf.numPages; p++) {
                const page = await pdf.getPage(p);
                const content = await page.getTextContent();
                const str = content.items.map(it => it.str).join(' ');
                text += str + '\n';
            }
            await importFromPlainText(text);
        } else {
            alert('暂不支持的文件类型，请选择 .docx / .pdf / .txt / .md');
        }
    } catch (err) {
        alert('导入失败');
    } finally {
        e.target.value = '';
    }
}

async function importFromPlainText(text) {
    const items = parseTextToOverlayItems(text);
    if (!items || items.length === 0) {
        alert('未识别到题目，请检查格式或先转为 TXT 再试');
        return;
    }
    localStorage.setItem(`overlay_${currentSubject}`, JSON.stringify(items));
    refreshAfterOverlayChange();
    alert(`导入完成：识别 ${items.length} 条题目，已应用到 ${SUBJECTS[currentSubject].name}`);
}

function parseTextToOverlayItems(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').map(s => s.trim());
    const isQStart = (s) => /^\d+[\.、\)]\s*/.test(s) || /^第\s*\d+\s*题/.test(s);
    const isOpt = (s) => /^[A-Da-d][\.、\)]\s+/.test(s);
    const isAns = (s) => /^(答案|正确答案)[:：]/.test(s);
    const blocks = [];
    let cur = [];
    for (const ln of lines) {
        if (isQStart(ln) && cur.length > 0) { blocks.push(cur); cur = [ln]; }
        else cur.push(ln);
    }
    if (cur.length) blocks.push(cur);
    const items = [];
    for (const b of blocks) {
        if (b.length === 0) continue;
        let qline = b[0].replace(/^\d+[\.、\)]\s*/, '').replace(/^第\s*\d+\s*题\s*/,'').trim();
        const other = b.slice(1);
        const opts = [];
        let answerLine = '';
        const desc = [];
        for (const ln of other) {
            if (isOpt(ln)) opts.push(ln.replace(/^([A-Da-d])[\.、\)]\s*/, ''));
            else if (isAns(ln)) answerLine = ln;
            else if (ln) desc.push(ln);
        }
        let type = 'essay';
        let answer = '';
        let answerText = '';
        if (answerLine) {
            const m = answerLine.match(/[:：]\s*([A-Da-d]{1,4})/);
            if (m) {
                const letters = m[1].toUpperCase();
                if (letters.length === 1) type = 'single'; else type = 'multiple';
                answer = letters;
            } else {
                answerText = answerLine.replace(/^(答案|正确答案)[:：]\s*/, '');
            }
        }
        if ((type === 'single' || type === 'multiple') && opts.length < 2) {
            // 选项不足，降级为主观题
            answerText = answerText || answer;
            answer = '';
            type = 'essay';
        }
        if (type === 'essay') {
            answerText = answerText || desc.join('\n');
        }
        const item = { type, question: qline };
        if (opts.length >= 2) item.options = [
            String(opts[0] || ''), String(opts[1] || ''), String(opts[2] || ''), String(opts[3] || '')
        ];
        if (answer) item.answer = answer;
        if (answerText) item.answerText = answerText;
        items.push(item);
    }
    return items;
}
function importOverlayFromFile() {
    const inp = document.getElementById('overlayFileInput');
    if (inp) inp.click();
}

function handleOverlayFileChange(e) {
    const file = e && e.target && e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(String(reader.result || 'null'));
            let items = null;
            let subjectKey = currentSubject;
            if (Array.isArray(data)) items = data;
            else if (data && Array.isArray(data.items)) { items = data.items; if (data.subject) subjectKey = String(data.subject).toLowerCase(); }
            if (!items || !Array.isArray(items)) { alert('导入失败：JSON 格式不正确'); return; }
            localStorage.setItem(`overlay_${subjectKey}`, JSON.stringify(items));
            refreshAfterOverlayChange();
            alert('导入成功，覆盖层已应用');
        } catch (err) {
            alert('导入失败：JSON 解析错误');
        } finally {
            e.target.value = '';
        }
    };
    reader.readAsText(file);
}

function exportOverlay() {
    const key = `overlay_${currentSubject}`;
    const raw = localStorage.getItem(key) || localStorage.getItem('overlay_global');
    if (!raw) { alert('当前科目暂无覆盖层可导出'); return; }
    const blob = new Blob([raw], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `overlay_${currentSubject}_${ts}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function clearOverlay() {
    localStorage.removeItem(`overlay_${currentSubject}`);
    refreshAfterOverlayChange();
    alert('已清空当前科目的本地覆盖层');
}

function importOverlayToServer() {
    const inp = document.getElementById('overlayUploadInput');
    if (inp) inp.click();
}

function handleOverlayUploadFileChange(e) {
    const file = e && e.target && e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const text = String(reader.result || '');
            // 简单校验 JSON
            try { JSON.parse(text); } catch { alert('上传失败：JSON 解析错误'); e.target.value=''; return; }
            const name = encodeURIComponent(file.name.replace(/\s+/g, '_'));
            const res = await fetch(`custom/upload?name=${name}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: text,
                cache: 'no-store'
            });
            if (!res.ok) { alert('上传失败'); e.target.value=''; return; }
            const data = await res.json();
            if (!data.ok) { alert('上传失败：' + (data.error || '未知错误')); e.target.value=''; return; }
            refreshAfterOverlayChange();
            alert('上传成功，已写入服务器 custom/ 并应用');
        } catch (err) {
            alert('上传失败');
        } finally {
            e.target.value = '';
        }
    };
    reader.readAsText(file);
}

// 提交主观题答案（不判对错，仅记录与展示参考答案）
function submitEssayAnswer(userAnswer, question) {
    answeredQuestions.add(currentIndex);
    saveProgress();
    updateStats();
    showAnswer();
}

// ================= 覆盖层（Overlay）支持 =================
function normalizeStr(s) {
    return (s || '')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[.,?!;:'"，。！？；：“”‘’\-_/\\]/g, '');
}

function computeQuestionKey(q) {
    return normalizeStr(q && q.question);
}

function coerceQuestion(item) {
    const out = { ...item };
    if (out.type) out.type = String(out.type).toLowerCase();
    if (Array.isArray(out.options)) out.options = out.options.map(x => String(x == null ? '' : x));
    if (typeof out.answer === 'string') out.answer = out.answer.trim();
    if (typeof out.answerText === 'string') out.answerText = out.answerText.trim();
    if (typeof out.question === 'string') out.question = out.question.trim();
    return out;
}

function mergeOverlayItems(subjectKey, items) {
    if (!Array.isArray(items) || items.length === 0) return { updated: 0, inserted: 0 };
    const byId = new Map();
    const byKey = new Map();
    allQuestions.forEach(q => {
        if (q.id != null) byId.set(q.id, q);
        const k = computeQuestionKey(q);
        if (k) byKey.set(k, q);
    });
    let updated = 0, inserted = 0;
    items.forEach(raw => {
        const item = coerceQuestion(raw);
        let target = null;
        if (item.id != null && byId.has(item.id)) {
            target = byId.get(item.id);
        } else {
            const key = computeQuestionKey(item);
            if (key && byKey.has(key)) target = byKey.get(key);
        }
        if (target) {
            ['type','question','options','answer','answerText'].forEach(f => {
                if (item[f] != null) target[f] = item[f];
            });
            updated++;
        } else {
            const nextId = (allQuestions.reduce((m, q) => Math.max(m, q.id || 0), 0) + 1);
            const toPush = { id: item.id != null ? item.id : nextId, ...item };
            allQuestions.push(toPush);
            inserted++;
        }
    });
    originalQuestions = [...allQuestions];
    return { updated, inserted };
}

async function fetchJsonSafe(url) {
    try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

function getLocalOverlays(subjectKey) {
    const out = [];
    const keys = [`overlay_${subjectKey}`, 'overlay_global'];
    keys.forEach(k => {
        const raw = localStorage.getItem(k);
        if (!raw) return;
        try {
            const json = JSON.parse(raw);
            if (Array.isArray(json)) out.push(json);
            else if (json && Array.isArray(json.items)) out.push(json.items);
        } catch {}
    });
    return out;
}

async function applyOverlaysForSubject(subjectKey) {
    // 本地 localStorage 覆盖层
    const localSets = getLocalOverlays(subjectKey);
    localSets.forEach(arr => mergeOverlayItems(subjectKey, arr));

    // 服务器 custom 目录覆盖层
    const idx = await fetchJsonSafe('custom/index.json');
    if (!idx || !Array.isArray(idx.files)) return;
    for (const f of idx.files) {
        const data = await fetchJsonSafe(`custom/${encodeURIComponent(f.name)}`);
        if (!data) continue;
        let items = null;
        if (Array.isArray(data)) items = data;
        else if (data && Array.isArray(data.items)) items = data.items;
        else continue;
        if (data && data.subject && String(data.subject).toLowerCase() !== subjectKey) {
            continue;
        }
        mergeOverlayItems(subjectKey, items);
    }
}

// 提交多选题答案
function submitMultipleAnswer(question) {
    const normalizeLetters = (ans) => (ans || '')
        .toUpperCase()
        .replace(/[^A-D]/g, '')
        .split('')
        .sort()
        .join('');

    const userAns = normalizeLetters(Array.from(multiSelected).join(''));
    if (!userAns) {
        alert('请至少选择一个选项');
        return;
    }

    const correctAns = normalizeLetters(question.answer);
    const isCorrect = userAns === correctAns;

    highlightMultipleOptions(question, userAns);
    if (isCorrect) {
        answeredQuestions.add(currentIndex);
        correctAnswers++;
        wrongQuestions.delete(question.id);
        saveProgress();
        updateStats();
        showCorrectMessage();
        if (autoAdvance) {
            setTimeout(() => {
                if (currentIndex < allQuestions.length - 1) {
                    currentIndex++;
                    showQuestion();
                }
            }, 1000);
        }
    } else {
        answeredQuestions.add(currentIndex);
        wrongQuestions.set(question.id, {
            question: question,
            userAnswer: userAns,
            timestamp: new Date().toLocaleString()
        });
        saveProgress();
        updateStats();
        showWrongMessage();
        showAnswer();
    }
}

function highlightSingleJudgeOptions(question, userAnswer) {
    const container = document.getElementById('optionsContainer');
    const items = Array.from(container.querySelectorAll('.option'));
    if (question.type === 'single') {
        const correctLetter = question.answer;
        items.forEach((div, idx) => {
            const letter = currentOptions[idx] && currentOptions[idx].letter;
            if (letter === correctLetter) div.classList.add('correct');
        });
        const userIdx = currentOptions.findIndex(o => o.letter === userAnswer);
        if (userIdx >= 0 && items[userIdx] && userAnswer !== question.answer) items[userIdx].classList.add('incorrect');
    } else if (question.type === 'judge') {
        items.forEach(div => { if (div.textContent === question.answer) div.classList.add('correct'); });
        items.forEach(div => { if (div.textContent !== question.answer && div.textContent === userAnswer) div.classList.add('incorrect'); });
    }
    items.forEach(div => div.onclick = null);
}

function highlightMultipleOptions(question, userAns) {
    const container = document.getElementById('optionsContainer');
    const items = Array.from(container.querySelectorAll('.option'));
    const ansSet = new Set((question.answer || '').toUpperCase().split(''));
    const userSet = new Set((userAns || '').toUpperCase().split(''));
    items.forEach((div, idx) => {
        const letter = currentOptions[idx] && currentOptions[idx].letter;
        if (ansSet.has(letter)) div.classList.add('correct');
        if (userSet.has(letter) && !ansSet.has(letter)) div.classList.add('incorrect');
    });
    items.forEach(div => div.onclick = null);
}

function setupAutoAdvanceToggle() {
    const el = document.getElementById('autoAdvanceToggle');
    if (el) {
        el.checked = autoAdvance;
        el.onchange = () => {
            autoAdvance = el.checked;
            localStorage.setItem('autoAdvance', autoAdvance ? '1' : '0');
        };
    }
}

function handleKeydown(e) {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const q = allQuestions[currentIndex];
    if (!q) return;
    if (e.key === 'ArrowRight') { nextQuestion(); return; }
    if (e.key === 'ArrowLeft') { previousQuestion(); return; }
    if (e.key === 's' || e.key === 'S') { shuffleCurrentOptions(); return; }
    if (e.key === 'a' || e.key === 'A') { showAnswer(); return; }
    if (e.key === 'c' || e.key === 'C') { toggleCollectQuestion(q.id); updateCollectButton(); return; }
    if (['1','2','3','4'].includes(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const container = document.getElementById('optionsContainer');
        const items = Array.from(container.querySelectorAll('.option'));
        if (!items[idx]) return;
        if (q.type === 'single') {
            const letter = currentOptions[idx] && currentOptions[idx].letter;
            if (letter) selectOption(letter, q);
        } else if (q.type === 'multiple') {
            items[idx].click();
        } else if (q.type === 'judge') {
            if (idx === 0) selectOption('正确', q);
            if (idx === 1) selectOption('错误', q);
        }
        return;
    }
    if (e.key === 'Enter') {
        if (q.type === 'multiple') submitMultipleAnswer(q);
        return;
    }
}

function getProgressKey() {
    return `quizProgress_${currentSubject}`;
}

// 初始化应用
function initApp() {
    // 合并所有题目
    allQuestions = SUBJECTS[currentSubject].getQuestions();
    originalQuestions = [...allQuestions];
    updateSubjectButtons();
    setupAutoAdvanceToggle();
    loadProgress();
    updateStats();
    const proceed = () => {
        renderQuestionNav();
        const params = new URLSearchParams(window.location.search);
        if (params.has('reviewWrong')) {
            reviewWrongQuestions();
        } else {
            showQuestion();
        }
    };
    applyOverlaysForSubject(currentSubject).then(proceed).catch(proceed);
}

// 切换模式
function switchMode(mode, clickedButton) {
    currentMode = mode;

    document.querySelectorAll('.question-container').forEach(el => {
        el.classList.remove('active');
    });
    document.getElementById(mode).classList.add('active');

    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (clickedButton) {
        clickedButton.classList.add('active');
    }
    
    if (mode === 'browse') {
        renderQuestionList();
    } else if (mode === 'wrong') {
        renderWrongList();
    } else if (mode === 'collected') {
        renderCollectedList();
    } else if (mode === 'stats') {
        updateStatsView();
    }
}

// 显示当前题目
function showQuestion() {
    if (currentIndex >= allQuestions.length) {
        currentIndex = allQuestions.length - 1;
    }
    
    const question = allQuestions[currentIndex];
    
    // 更新题目信息
    document.getElementById('questionNumber').textContent = `第 ${currentIndex + 1} 题 / ${allQuestions.length}`;
    const jumpInput = document.getElementById('jumpInput');
    if (jumpInput) jumpInput.value = currentIndex + 1;
    document.getElementById('questionType').textContent = getTypeLabel(question.type);
    document.getElementById('questionText').textContent = question.question;
    const aa = document.getElementById('autoAdvanceToggle');
    if (aa) aa.checked = autoAdvance;
    
    // 更新进度条
    const progress = ((currentIndex + 1) / allQuestions.length) * 100;
    document.getElementById('progressFill').style.width = progress + '%';
    document.getElementById('currentQuestion').textContent = currentIndex + 1;
    
    // 重置选项顺序（每次显示新题目时）
    currentOptions = [];
    
    // 显示选项
    renderOptions(question);
    
    // 隐藏答案
    document.getElementById('answerDisplay').classList.remove('show');
    document.getElementById('showAnswerBtn').textContent = '显示答案';
    
    // 更新按钮状态
    document.getElementById('prevBtn').disabled = currentIndex === 0;
    document.getElementById('nextBtn').disabled = currentIndex === allQuestions.length - 1;
    
    // 更新乱序按钮显示状态（只有选择题、判断题、填空题才显示）
    const shuffleBtn = document.getElementById('shuffleOptionsBtn');
    if (question.type === 'single' || question.type === 'multiple' || question.type === 'judge' || question.type === 'fill') {
        shuffleBtn.style.display = 'inline-block';
    } else {
        shuffleBtn.style.display = 'none';
    }
    
    // 更新收藏按钮状态
    updateCollectButton();
    updateNavActive();
}

// 渲染选项
function renderOptions(question) {
    const container = document.getElementById('optionsContainer');
    container.innerHTML = '';
    
    if (question.type === 'single' || question.type === 'multiple') {
        // 保存原始选项顺序
        originalOptions = question.options.map((opt, idx) => ({
            text: opt,
            letter: String.fromCharCode(65 + idx)
        }));
        
        // 如果还没有当前选项顺序，就使用原始顺序
        if (currentOptions.length === 0) {
            currentOptions = [...originalOptions];
        }
        
        // 使用当前选项顺序渲染
        // 多选题：初始化选择集合
        if (question.type === 'multiple') {
            multiSelected = new Set();
        }

        currentOptions.forEach((optionObj) => {
            const div = document.createElement('div');
            div.className = 'option';
            div.textContent = `${optionObj.letter}、${optionObj.text}`;

            if (question.type === 'single') {
                div.onclick = () => selectOption(optionObj.letter, question);
            } else if (question.type === 'multiple') {
                div.onclick = () => {
                    if (div.classList.contains('selected')) {
                        div.classList.remove('selected');
                        multiSelected.delete(optionObj.letter);
                    } else {
                        div.classList.add('selected');
                        multiSelected.add(optionObj.letter);
                    }
                };
            }
            container.appendChild(div);
        });

        // 多选题：渲染提交按钮
        if (question.type === 'multiple') {
            const submitBtn = document.createElement('button');
            submitBtn.className = 'btn btn-primary';
            submitBtn.textContent = '提交答案';
            submitBtn.style.marginTop = '10px';
            submitBtn.onclick = () => submitMultipleAnswer(question);
            container.appendChild(submitBtn);
        }
    } else if (question.type === 'fill' || question.type === 'essay') {
        const wrapper = document.createElement('div');
        
        const input = document.createElement('textarea');
        input.id = 'userAnswer';
        input.style.width = '100%';
        input.style.padding = '15px';
        input.style.borderRadius = '8px';
        input.style.border = '2px solid #e0e0e0';
        input.style.fontSize = '1.1rem';
        input.style.minHeight = '120px';
        input.style.fontFamily = 'inherit';
        input.placeholder = '请输入答案...';
        input.style.marginBottom = '15px';
        wrapper.appendChild(input);
        
        const submitBtn = document.createElement('button');
        submitBtn.className = 'btn btn-primary';
        submitBtn.textContent = '提交答案';
        submitBtn.style.width = '100%';
        submitBtn.style.padding = '15px';
        submitBtn.style.fontSize = '1.1rem';
        submitBtn.onclick = () => {
            const userAnswer = input.value.trim();
            if (!userAnswer) {
                alert('请输入答案');
                return;
            }
            if (question.type === 'fill') {
                submitFillAnswer(userAnswer, question);
            } else {
                submitEssayAnswer(userAnswer, question);
            }
        };
        wrapper.appendChild(submitBtn);
        
        container.appendChild(wrapper);
    } else if (question.type === 'judge') {
        ['正确', '错误'].forEach(option => {
            const div = document.createElement('div');
            div.className = 'option';
            div.textContent = option;
            div.onclick = () => selectOption(option, question);
            container.appendChild(div);
        });
    }
}

// 选择选项
function selectOption(answer, question) {
    const isCorrect = answer === question.answer;
    
    if (isCorrect) {
        // 答对了
        answeredQuestions.add(currentIndex);
        correctAnswers++;
        // 如果之前答错过，现在答对了，从错题集中移除
        wrongQuestions.delete(question.id);
        saveProgress();
        updateStats();
        highlightSingleJudgeOptions(question, answer);
        showCorrectMessage();
        showCorrectMessage();
        if (autoAdvance) {
            setTimeout(() => {
                if (currentIndex < allQuestions.length - 1) {
                    currentIndex++;
                    showQuestion();
                }
            }, 1000);
        }
    } else {
        // 答错了
        answeredQuestions.add(currentIndex);
        // 记录到错题集
        wrongQuestions.set(question.id, {
            question: question,
            userAnswer: answer,
            timestamp: new Date().toLocaleString()
        });
        saveProgress();
        updateStats();
        highlightSingleJudgeOptions(question, answer);
        showWrongMessage();
        showWrongMessage();
        showAnswer();
    }
}

// 提交填空题答案
function submitFillAnswer(userAnswer, question) {
    // 标准化答案的函数：转小写，移除所有空格和中英文标点
    const normalize = (str) => {
        return str.toLowerCase()
                  .replace(/\s+/g, '') // 移除空格
                  .replace(/[.,?!;:'"，。！？；：'“]/g, ''); // 移除中英文标点
    };

    const userAnswerNorm = normalize(userAnswer);
    const correctAnswers = question.answer.split('|').map(ans => normalize(ans));

    // 检查用户的答案是否与任何一个正确答案完全匹配
    const isCorrect = correctAnswers.some(ans => userAnswerNorm === ans);
    
    if (isCorrect) {
        // 答对了
        answeredQuestions.add(currentIndex);
        correctAnswers++;
        // 如果之前答错过，现在答对了，从错题集中移除
        wrongQuestions.delete(question.id);
        saveProgress();
        updateStats();
        
        // 显示正确提示
        showCorrectMessage();
        
        // 1秒后自动跳到下一题
        setTimeout(() => {
            if (currentIndex < allQuestions.length - 1) {
                currentIndex++;
                showQuestion();
            }
        }, 1000);
    } else {
        // 答错了
        answeredQuestions.add(currentIndex);
        // 记录到错题集
        wrongQuestions.set(question.id, {
            question: question,
            userAnswer: userAnswer,
            timestamp: new Date().toLocaleString()
        });
        saveProgress();
        updateStats();
        
        // 显示错误提示和答案
        showWrongMessage();
        showAnswer();
    }
}

// 显示答案
function showAnswer() {
    const question = allQuestions[currentIndex];
    const display = document.getElementById('answerDisplay');
    const answerText = document.getElementById('answerText');
    
    answerText.textContent = question.answerText;
    display.classList.add('show');
    document.getElementById('showAnswerBtn').textContent = '✓ 已显示';
}

// 显示正确消息
function showCorrectMessage() {
    const message = document.createElement('div');
    message.className = 'feedback-message correct';
    message.innerHTML = '✓ 恭喜！答对了！';
    document.body.appendChild(message);
    
    setTimeout(() => {
        message.remove();
    }, 1500);
}

// 显示错误消息
function showWrongMessage() {
    // 移除已有的错误提示，避免叠加
    document.querySelectorAll('.feedback-message.wrong').forEach(el => el.remove());
    const message = document.createElement('div');
    message.className = 'feedback-message wrong';
    message.innerHTML = '✗ 答错了，请查看答案';
    document.body.appendChild(message);
    
    // 1.5秒后自动消失
    setTimeout(() => {
        message.remove();
    }, 1500);
}

// 下一题
function nextQuestion() {
    if (currentIndex < allQuestions.length - 1) {
        currentIndex++;
        showQuestion();
    }
}

function previousQuestion() {
    if (currentIndex > 0) {
        currentIndex--;
        showQuestion();
    }
}

// 跳转到指定题号
function jumpToQuestion() {
    const input = document.getElementById('jumpInput');
    if (!input) return;
    const val = parseInt(input.value, 10);
    if (isNaN(val)) {
        alert('请输入有效的题号');
        return;
    }
    if (val < 1 || val > allQuestions.length) {
        alert(`题号超出范围 1-${allQuestions.length}`);
        return;
    }
    currentIndex = val - 1;
    showQuestion();
}

// 更新统计信息
function updateStats() {
    const total = allQuestions.length;
    const answered = answeredQuestions.size;
    const accuracy = answered > 0 ? Math.round((correctAnswers / answered) * 100) : 0;
    
    document.getElementById('totalQuestions').textContent = total;
    document.getElementById('correctCount').textContent = correctAnswers;
    document.getElementById('accuracy').textContent = accuracy + '%';
}

// 获取题型标签
function getTypeLabel(type) {
    const labels = {
        'single': '单选题',
        'multiple': '多选题',
        'fill': '填空题',
        'judge': '判断题',
        'essay': '简答题'
    };
    return labels[type] || type;
}

// 浏览模式 - 渲染题目列表（优化版：自动显示答案）
function renderQuestionList() {
    const list = document.getElementById('questionList');
    list.innerHTML = '';
    
    let filtered = allQuestions;
    
    // 按类型过滤
    if (currentFilter !== 'all') {
        filtered = filtered.filter(q => q.type === currentFilter);
    }
    
    // 按搜索词过滤
    if (currentSearchTerm) {
        const term = currentSearchTerm.toLowerCase();
        filtered = filtered.filter(q => 
            q.question.toLowerCase().includes(term) || 
            q.answerText.toLowerCase().includes(term)
        );
    }
    
    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><p>没有找到匹配的题目</p></div>';
        return;
    }
    
    filtered.forEach((question, index) => {
        const questionIndex = allQuestions.indexOf(question);
        const div = document.createElement('div');
        div.className = 'question-item';
        div.style.cursor = 'pointer';
        div.style.transition = 'all 0.3s ease';
        
        // 构建选项显示（如果是选择题）
        let optionsHtml = '';
        if (question.type === 'single' || question.type === 'multiple') {
            optionsHtml = '<div style="margin-top: 8px; padding: 8px; background: #f5f5f5; border-radius: 6px; font-size: 0.85em;">';
            question.options.forEach((option, idx) => {
                const letter = String.fromCharCode(65 + idx);
                const isCorrect = question.type === 'multiple' ? (question.answer || '').toUpperCase().includes(letter) : (letter === question.answer);
                const style = isCorrect ? 'color: #4CAF50; font-weight: bold;' : 'color: #666;';
                optionsHtml += `<div style="${style}">  ${letter}、${option}</div>`;
            });
            optionsHtml += '</div>';
        }
        
        // 构建答案显示
        let answerHtml = `
            <div style="margin-top: 10px; padding: 10px; background: #e8f5e9; border-left: 4px solid #4CAF50; border-radius: 4px;">
                <div style="color: #2e7d32; font-weight: bold; margin-bottom: 5px;">✓ 答案：${question.answer}</div>
                <div style="color: #555; font-size: 0.9em;">${question.answerText}</div>
            </div>
        `;
        
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                        <strong style="color: #667eea;">第 ${questionIndex + 1} 题</strong>
                        <span style="background: #667eea; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75em;">${getTypeLabel(question.type)}</span>
                    </div>
                    <p style="margin: 8px 0; font-size: 0.95em; color: #333; line-height: 1.5;">${question.question}</p>
                    ${optionsHtml}
                    ${answerHtml}
                </div>
                <button class="btn btn-primary" style="min-width: 80px; padding: 8px 12px; font-size: 0.9em; margin-left: 10px; white-space: nowrap;" onclick="event.stopPropagation(); goToPracticMode(${questionIndex})">练习</button>
            </div>
        `;
        
        // 悬停效果
        div.onmouseover = () => {
            div.style.background = '#f9f9f9';
            div.style.transform = 'translateX(5px)';
        };
        div.onmouseout = () => {
            div.style.background = 'white';
            div.style.transform = 'translateX(0)';
        };
        
        list.appendChild(div);
    });
}

// 渲染右侧题号/类型导航（按题型分组）
function renderQuestionNav() {
    const nav = document.getElementById('questionNavList');
    if (!nav) return;
    nav.innerHTML = '';
    const typeLabel = getTypeLabel;
    const grouped = {};
    allQuestions.forEach((q, idx) => {
        if (!grouped[q.type]) grouped[q.type] = [];
        grouped[q.type].push({ q, idx });
    });
    const typeOrder = Object.keys(grouped).sort((a, b) => grouped[a][0].idx - grouped[b][0].idx);

    typeOrder.forEach(type => {
        const list = grouped[type];
        if (!list || list.length === 0) return;
        const group = document.createElement('div');
        group.className = 'nav-group';
        
        const title = document.createElement('div');
        title.className = 'nav-group-title';
        title.innerHTML = `<span>${typeLabel(type)}</span><span>${list.length} 题</span>`;
        group.appendChild(title);
        
        const listContainer = document.createElement('div');
        listContainer.className = 'nav-list';
        
        list.forEach(({ q, idx }) => {
            const item = document.createElement('div');
            item.className = 'nav-item' + (idx === currentIndex ? ' active' : '');
            item.setAttribute('data-index', idx);
            item.innerHTML = `<span class="nav-num">第 ${idx + 1} 题</span><span class="nav-type">${typeLabel(q.type)}</span>`;
            listContainer.appendChild(item);
        });
        
        group.appendChild(listContainer);
        nav.appendChild(group);
    });
    
    nav.onclick = (e) => {
        const target = e.target.closest('.nav-item');
        if (!target) return;
        const idx = parseInt(target.getAttribute('data-index'), 10);
        if (isNaN(idx)) return;
        currentIndex = idx;
        showQuestion();
    };
    updateNavActive();
}

// 只更新右侧导航高亮，减少重渲染
function updateNavActive() {
    const nav = document.getElementById('questionNavList');
    if (!nav) return;
    nav.querySelectorAll('.nav-item.active').forEach(el => el.classList.remove('active'));
    const active = nav.querySelector(`.nav-item[data-index="${currentIndex}"]`);
    if (active) active.classList.add('active');
}

// 跳转到练习模式
function goToPracticMode(questionIndex) {
    currentIndex = questionIndex;
    switchMode('practice');
    showQuestion();
}

// 搜索题目
function filterQuestions() {
    currentSearchTerm = document.getElementById('searchInput').value;
    renderQuestionList();
}

// 按类型过滤
function filterByType(type, clickedButton) {
    currentFilter = type;

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (clickedButton) {
        clickedButton.classList.add('active');
    }
    
    renderQuestionList();
}

// 统计视图
function updateStatsView() {
    const total = allQuestions.length;
    const accuracy = answeredQuestions.size > 0 ? 
        Math.round((correctAnswers / answeredQuestions.size) * 100) : 0;
    const timeMinutes = Math.round((Date.now() - startTime) / 60000);
    
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statCorrect').textContent = correctAnswers;
    document.getElementById('statAccuracy').textContent = accuracy + '%';
    document.getElementById('statTime').textContent = timeMinutes + ' 分钟';
    
    // 题型分布
    const typeStats = {};
    allQuestions.forEach(q => {
        typeStats[q.type] = (typeStats[q.type] || 0) + 1;
    });
    
    const statsDiv = document.getElementById('typeStats');
    statsDiv.innerHTML = '';
    
    Object.entries(typeStats).forEach(([type, count]) => {
        const div = document.createElement('div');
        div.style.padding = '15px';
        div.style.background = '#f9f9f9';
        div.style.borderRadius = '8px';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        
        div.innerHTML = `
            <span><strong>${getTypeLabel(type)}</strong></span>
            <span style="color: #667eea; font-weight: bold;">${count} 题</span>
        `;
        
        statsDiv.appendChild(div);
    });
}

// 导出数据
function exportStats() {
    const data = {
        totalQuestions: allQuestions.length,
        correctAnswers: correctAnswers,
        answeredQuestions: answeredQuestions.size,
        accuracy: answeredQuestions.size > 0 ? 
            Math.round((correctAnswers / answeredQuestions.size) * 100) : 0,
        exportTime: new Date().toLocaleString('zh-CN')
    };
    
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AI复习统计_${Date.now()}.json`;
    a.click();
}

// 重置当前科目的练习进度
function resetProgress() {
    if (confirm('确定要重置当前科目的练习进度吗？\n（错题和收藏将保留）')) {
        currentIndex = 0;
        correctAnswers = 0;
        answeredQuestions.clear();
        startTime = Date.now();
        
        // 保存已重置的进度
        saveProgress();
        
        // 更新界面
        showQuestion();
        updateStats();
        
        alert('当前科目进度已重置');
    }
}

// 清空所有数据
function resetAllData() {
    if (confirm('确定要清空所有数据吗？此操作不可恢复！')) {
        correctAnswers = 0;
        answeredQuestions.clear();
        wrongQuestions.clear();
        currentIndex = 0;
        startTime = Date.now();
        collectedQuestions.clear();
        localStorage.removeItem(getProgressKey());
        showQuestion();
        updateStats();
        if (currentMode === 'wrong') {
            renderWrongList();
        }
        alert('已清空所有数据');
    }
}

// 切换科目
function switchSubject(subjectKey) {
    if (!SUBJECTS[subjectKey]) {
        alert('未知科目');
        return;
    }
    currentSubject = subjectKey;
    localStorage.setItem('currentSubject', subjectKey);
    
    // 重新加载题目与覆盖层
    allQuestions = SUBJECTS[currentSubject].getQuestions();
    originalQuestions = [...allQuestions];
    const after = () => {
        loadProgress();
        updateStats();
        showQuestion();
        updateSubjectButtons();
        renderQuestionNav();
        alert(`已切换科目：${SUBJECTS[subjectKey].name}`);
    };
    applyOverlaysForSubject(subjectKey).then(after).catch(after);
}

// 更新科目按钮样式
function updateSubjectButtons() {
    document.querySelectorAll('[data-subject-btn]').forEach(btn => {
        const key = btn.getAttribute('data-subject');
        if (key === currentSubject) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// 保存进度（按科目隔离）
function saveProgress() {
    const progress = {
        currentIndex: currentIndex,
        correctAnswers: correctAnswers,
        answeredQuestions: Array.from(answeredQuestions),
        wrongQuestions: Array.from(wrongQuestions.entries()),
        collectedQuestions: Array.from(collectedQuestions.entries()),
        startTime: startTime
    };
    localStorage.setItem(getProgressKey(), JSON.stringify(progress));
}

// 加载进度（按科目隔离）
function loadProgress() {
    const saved = localStorage.getItem(getProgressKey());
    if (saved) {
        const progress = JSON.parse(saved);
        currentIndex = progress.currentIndex || 0;
        correctAnswers = progress.correctAnswers || 0;
        answeredQuestions = new Set(progress.answeredQuestions || []);
        wrongQuestions = new Map(progress.wrongQuestions || []);
        collectedQuestions = new Map(progress.collectedQuestions || []);
        startTime = progress.startTime || Date.now();
    } else {
        // 没有进度，重置状态
        currentIndex = 0;
        correctAnswers = 0;
        answeredQuestions.clear();
        wrongQuestions.clear();
        collectedQuestions.clear();
        startTime = Date.now();
    }
}

// 显示错题集
function renderWrongList() {
    const list = document.getElementById('wrongList');
    const count = document.getElementById('wrongCount');
    
    list.innerHTML = '';
    count.textContent = wrongQuestions.size;
    
    if (wrongQuestions.size === 0) {
        list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎉</div><p>太棒了！没有错题，继续加油！</p></div>';
        return;
    }
    
    wrongQuestions.forEach((wrongData, questionId) => {
        const question = wrongData.question;
        const div = document.createElement('div');
        div.className = 'question-item';
        
        // 构建选项显示（如果是选择题）
        let optionsHtml = '';
        if (question.type === 'single' || question.type === 'multiple') {
            optionsHtml = '<div style="margin-top: 12px; padding: 12px; background: #f5f5f5; border-radius: 6px; font-size: 0.95em;">';
            question.options.forEach((option, idx) => {
                const letter = String.fromCharCode(65 + idx);
                const isCorrect = question.type === 'multiple' ? (question.answer || '').toUpperCase().includes(letter) : (letter === question.answer);
                const isUserAnswer = question.type === 'multiple' ? (String(wrongData.userAnswer || '').toUpperCase().includes(letter)) : (letter === wrongData.userAnswer);
                let style = 'color: #666;';
                if (isCorrect) {
                    style = 'color: #4CAF50; font-weight: bold;'; // 正确答案：绿色
                } else if (isUserAnswer) {
                    style = 'color: #f44336; font-weight: bold;'; // 用户答案：红色
                }
                optionsHtml += `<div style="${style}">  ${letter}、${option}</div>`;
            });
            optionsHtml += '</div>';
        }
        
        // 构建答案显示
        let answerHtml = `
            <div style="margin-top: 12px; padding: 12px; background: #e8f5e9; border-left: 4px solid #4CAF50; border-radius: 4px;">
                <div style="color: #2e7d32; font-weight: bold; margin-bottom: 5px;">✓ 正确答案：${question.answer}</div>
                <div style="color: #555; font-size: 0.95em;">${question.answerText}</div>
            </div>
        `;
        
        // 用户答案显示
        let userAnswerHtml = '';
        if (wrongData.userAnswer) {
            userAnswerHtml = `
                <div style="margin-top: 12px; padding: 12px; background: #ffebee; border-left: 4px solid #f44336; border-radius: 4px;">
                    <div style="color: #c62828; font-weight: bold; margin-bottom: 5px;">✗ 你的答案：${wrongData.userAnswer}</div>
                </div>
            `;
        }
        
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                        <strong style="color: #667eea; font-size: 1.1rem;">第 ${question.id} 题</strong>
                        <span style="background: #667eea; color: white; padding: 3px 10px; border-radius: 12px; font-size: 0.85em;">${getTypeLabel(question.type)}</span>
                    </div>
                    <p style="margin: 10px 0; font-size: 1.05rem; color: #333; line-height: 1.6;">${question.question}</p>
                    ${optionsHtml}
                    ${userAnswerHtml}
                    ${answerHtml}
                </div>
                <div style="display: flex; gap: 8px; margin-left: 10px;">
                    <button class="btn btn-primary" style="min-width: 80px; padding: 10px 16px; font-size: 0.95rem; white-space: nowrap;" onclick="reviewQuestion(${question.id})">再练一遍</button>
                    <button class="btn btn-secondary" style="min-width: 80px; padding: 10px 16px; font-size: 0.95rem; white-space: nowrap;" onclick="removeFromWrong(${question.id}); renderWrongList();">移除</button>
                </div>
            </div>
        `;
        
        list.appendChild(div);
    });
}

// 复习单个错题
function reviewQuestion(questionId) {
    const question = allQuestions.find(q => q.id === questionId);
    if (question) {
        currentIndex = allQuestions.indexOf(question);
        switchMode('practice');
        showQuestion();
    }
}

// 从错题集中移除单个题目
function removeFromWrong(questionId) {
    wrongQuestions.delete(questionId);
    saveProgress();
}

// 复习所有错题
function reviewWrongQuestions() {
    if (wrongQuestions.size === 0) {
        alert('没有错题，继续加油！');
        return;
    }
    
    // 创建错题列表
    const wrongIds = Array.from(wrongQuestions.keys());
    const wrongQuestionsArray = originalQuestions.filter(q => wrongIds.includes(q.id));
    
    if (wrongQuestionsArray.length === 0) {
        alert('没有找到对应的错题');
        return;
    }
    
    // 保存当前状态
    isReviewingWrong = true;
    
    // 临时替换为错题列表
    allQuestions = [...wrongQuestionsArray];

    // 显示“退出复习”按钮
    document.getElementById('exitReviewBtn').style.display = 'inline-block';
    currentIndex = 0;
    correctAnswers = 0;
    answeredQuestions.clear();
    
    // 确保在显示题目前已经切换模式
    switchMode('practice');
    
    // 延迟显示题目，确保 DOM 已经准备好
    setTimeout(() => {
        showQuestion();
        alert(`开始复习 ${wrongQuestionsArray.length} 道错题`);
    }, 100);
}

// 清空错题集
function clearWrongQuestions() {
    if (confirm('确定要清空错题集吗？')) {
        wrongQuestions.clear();
        saveProgress();
        renderWrongList();
        alert('已清空错题集');
    }
}

// ========== 收藏题目功能 ==========

// 收藏或取消收藏题目
function toggleCollectQuestion(questionId) {
    const question = allQuestions.find(q => q.id === questionId);
    if (!question) return;
    
    if (collectedQuestions.has(questionId)) {
        // 取消收藏
        collectedQuestions.delete(questionId);
    } else {
        // 收藏
        collectedQuestions.set(questionId, {
            question: question,
            timestamp: new Date().toLocaleString()
        });
    }
    
    saveProgress();
    updateCollectButton();
}

// 更新收藏按钮的显示状态
function updateCollectButton() {
    const btn = document.getElementById('collectBtn');
    if (!btn) return;
    
    const question = allQuestions[currentIndex];
    if (collectedQuestions.has(question.id)) {
        btn.textContent = '★ 已收藏';
        btn.style.background = '#FFB800';
        btn.style.color = 'white';
    } else {
        btn.textContent = '☆ 收藏';
        btn.style.background = '#f0f0f0';
        btn.style.color = '#333';
    }
}

// 显示收藏列表
function renderCollectedList() {
    const list = document.getElementById('collectedList');
    const count = document.getElementById('collectedCount');
    
    list.innerHTML = '';
    count.textContent = collectedQuestions.size;
    
    if (collectedQuestions.size === 0) {
        list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📌</div><p>还没有收藏任何题目，点击"☆ 收藏"来保存重要题目吧！</p></div>';
        return;
    }
    
    collectedQuestions.forEach((collectedData, questionId) => {
        const question = collectedData.question;
        const div = document.createElement('div');
        div.className = 'question-item';
        
        // 构建选项显示（如果是选择题）
        let optionsHtml = '';
        if (question.type === 'single' || question.type === 'multiple') {
            optionsHtml = '<div style="margin-top: 12px; padding: 12px; background: #f5f5f5; border-radius: 6px; font-size: 0.95em;">';
            question.options.forEach((option, idx) => {
                const letter = String.fromCharCode(65 + idx);
                const isCorrect = letter === question.answer;
                const style = isCorrect ? 'color: #4CAF50; font-weight: bold;' : 'color: #666;';
                optionsHtml += `<div style="${style}">  ${letter}、${option}</div>`;
            });
            optionsHtml += '</div>';
        }
        
        // 构建答案显示
        let answerHtml = `
            <div style="margin-top: 12px; padding: 12px; background: #e8f5e9; border-left: 4px solid #4CAF50; border-radius: 4px;">
                <div style="color: #2e7d32; font-weight: bold; margin-bottom: 5px;">✓ 答案：${question.answer}</div>
                <div style="color: #555; font-size: 0.95em;">${question.answerText}</div>
            </div>
        `;
        
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                        <strong style="color: #667eea; font-size: 1.1rem;">第 ${question.id} 题</strong>
                        <span style="background: #667eea; color: white; padding: 3px 10px; border-radius: 12px; font-size: 0.85em;">${getTypeLabel(question.type)}</span>
                        <span style="color: #999; font-size: 0.85em;">收藏于 ${collectedData.timestamp}</span>
                    </div>
                    <p style="margin: 10px 0; font-size: 1.05rem; color: #333; line-height: 1.6;">${question.question}</p>
                    ${optionsHtml}
                    ${answerHtml}
                </div>
                <div style="display: flex; gap: 8px; margin-left: 10px;">
                    <button class="btn btn-primary" style="min-width: 80px; padding: 10px 16px; font-size: 0.95rem; white-space: nowrap;" onclick="goToPracticMode(${question.id - 1})">练习</button>
                    <button class="btn btn-secondary" style="min-width: 80px; padding: 10px 16px; font-size: 0.95rem; white-space: nowrap;" onclick="toggleCollectQuestion(${question.id}); renderCollectedList();">取消</button>
                </div>
            </div>
        `;
        
        list.appendChild(div);
    });
}

// 清空收藏
function clearCollectedQuestions() {
    if (confirm('确定要清空所有收藏吗？')) {
        collectedQuestions.clear();
        saveProgress();
        renderCollectedList();
        alert('已清空收藏');
    }
}

// 乱序当前题目的选项
function shuffleCurrentOptions() {
    const question = allQuestions[currentIndex];
    
    // 只对选择题和判断题支持乱序
    if (question.type !== 'single' && question.type !== 'multiple' && question.type !== 'judge') {
        return;
    }
    
    // 检查是否已经乱序过
    const isShuffled = currentOptions.length > 0 && 
                       JSON.stringify(currentOptions) !== JSON.stringify(originalOptions);
    
    if (isShuffled) {
        // 已经乱序，恢复原始顺序
        currentOptions = [...originalOptions];
    } else {
        // 还没乱序，进行乱序
        currentOptions = [...originalOptions].sort(() => Math.random() - 0.5);
    }
    
    // 重新渲染选项
    renderOptions(question);
}

// 退出复习模式
function exitReviewMode() {
    if (!isReviewingWrong) return;

    // 恢复原始题库
    allQuestions = [...originalQuestions];
    isReviewingWrong = false;

    // 隐藏“退出复习”按钮
    document.getElementById('exitReviewBtn').style.display = 'none';

    // 重置视图到第一题
    currentIndex = 0;
    showQuestion();
    updateStats();
    renderQuestionNav();

    alert('已退出复习模式，返回完整题库。');
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initApp);
document.addEventListener('keydown', handleKeydown);
