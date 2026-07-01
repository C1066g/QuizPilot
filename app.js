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
let overlayEditorState = null;

// ── PWA: Service Worker ──
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
}

try { if (typeof window !== 'undefined' && window.pdfjsLib) { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js'; } } catch (e) {}

function setupHelpOverlay() {
    const overlay = document.getElementById('helpOverlay');
    const btn = document.getElementById('helpBtn');
    const closeBtn = document.getElementById('helpClose');
    const resetBtn = document.getElementById('helpResetTipsBtn');
    if (!overlay || !btn || !closeBtn) return;
    const visible = () => overlay.style.display !== 'none';
    const open = () => { overlay.style.display = 'flex'; };
    const close = () => { overlay.style.display = 'none'; };
    btn.onclick = () => open();
    closeBtn.onclick = () => close();
    if (resetBtn) resetBtn.onclick = () => { try { localStorage.removeItem('tips_v20251223'); showToast('已重置小贴士，下次将再次显示', 'success'); } catch {} };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    window.addEventListener('keydown', (e) => {
        if ((e.key === '?' || (e.key === '/' && e.shiftKey)) && !visible()) { e.preventDefault(); open(); return; }
        if (visible() && e.key === 'Escape') { e.preventDefault(); close(); return; }
    }, true);
}

function setupFeatureTips() {
    try {
        const key = 'tips_v20251223';
        if (localStorage.getItem(key) === '1') return;
        const isMac = /Mac/i.test(navigator.userAgent || '');
        const mod = isMac ? '⌘' : 'Ctrl';
        setTimeout(() => showToast(`快捷键：${mod}+K 打开快速跳题，Esc 关闭`, 'info', 6000), 300);
        setTimeout(() => showToast('右侧导航可折叠：点击顶部“📑 导航”按钮', 'info', 6000), 1800);
        setTimeout(() => showToast('顶部栏自动隐藏：下滑隐藏，上滑显示', 'info', 6000), 3300);
        localStorage.setItem(key, '1');
    } catch {}
}

function setupNavToggle() {
    const root = document.documentElement;
    const btn = document.getElementById('navToggle');
    let collapsed = (localStorage.getItem('navCollapsed') || '0') === '1';
    const apply = () => {
        if (collapsed) root.setAttribute('data-nav', 'collapsed');
        else root.removeAttribute('data-nav');
        if (btn) btn.textContent = collapsed ? '📑 导航(已折叠)' : '📑 导航';
    };
    apply();
    if (btn) btn.onclick = () => { collapsed = !collapsed; localStorage.setItem('navCollapsed', collapsed ? '1' : '0'); apply(); };
}

function setupQuickJumpPanel() {
    const overlay = document.getElementById('quickJumpOverlay');
    const input = document.getElementById('quickInput');
    const list = document.getElementById('quickList');
    if (!overlay || !input || !list) return;
    let results = [];
    let active = 0;
    const visible = () => overlay.style.display !== 'none';
    const open = () => { overlay.style.display = 'flex'; input.value = ''; build(''); setTimeout(() => input.focus(), 0); };
    const close = () => { overlay.style.display = 'none'; };
    const build = (q) => {
        const term = String(q || '').trim();
        results = [];
        if (!allQuestions || !allQuestions.length) { list.innerHTML = ''; return; }
        if (/^\d{1,5}$/.test(term)) {
            const idx = Math.min(Math.max(parseInt(term, 10) - 1, 0), allQuestions.length - 1);
            results.push({ idx, score: 1 });
        } else {
            const lower = term.toLowerCase();
            for (let i = 0; i < allQuestions.length; i++) {
                const it = allQuestions[i];
                const text = [it.question || '', ...(Array.isArray(it.options) ? it.options : []), it.answerText || ''].join(' ').toLowerCase();
                if (!lower || text.includes(lower)) results.push({ idx: i, score: lower ? 1 : 0 });
                if (results.length >= 200) break;
            }
        }
        active = 0;
        render();
    };
    const render = () => {
        list.innerHTML = '';
        results.forEach((r, i) => {
            const it = allQuestions[r.idx];
            const div = document.createElement('div');
            div.className = 'quick-item' + (i === active ? ' active' : '');
            div.dataset.index = String(r.idx);
            const title = String(it.question || '').slice(0, 80);
            const snip = (Array.isArray(it.options) ? it.options.filter(Boolean).join(' · ') : (it.answerText || '')).slice(0, 120);
            div.innerHTML = `<div class="quick-num">#${r.idx + 1}</div><div><div class="quick-title">${escapeHTML(title)}</div><div class="quick-snippet">${escapeHTML(snip)}</div></div>`;
            div.onclick = () => { jumpTo(r.idx); };
            list.appendChild(div);
        });
    };
    const jumpTo = (idx) => {
        if (idx == null) return;
        currentIndex = Math.min(Math.max(idx, 0), allQuestions.length - 1);
        if (currentMode !== 'practice') switchMode('practice');
        showQuestion();
        close();
    };
    input.addEventListener('input', () => build(input.value));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    window.addEventListener('keydown', (e) => {
        if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); open(); return; }
        if (!visible()) return;
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); if (active < results.length - 1) { active++; render(); } return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); if (active > 0) { active--; render(); } return; }
        if (e.key === 'Enter') { e.preventDefault(); const r = results[active]; if (r) jumpTo(r.idx); return; }
    }, true);
}

function openOverlayEditor(onlyUnknown = true) {
    const key = `overlay_${currentSubject}`;
    const raw = localStorage.getItem(key);
    if (!raw) { showToast('当前科目无本地覆盖层可校对', 'info'); return; }
    let items;
    try { items = JSON.parse(raw); } catch { showToast('覆盖层 JSON 解析失败', 'error'); return; }
    if (!Array.isArray(items)) { showToast('覆盖层结构无效', 'error'); return; }
    const indexes = [];
    items.forEach((it, idx) => {
        if (!onlyUnknown || it._unknown) indexes.push(idx);
    });
    if (indexes.length === 0) { showToast(onlyUnknown ? '没有低置信度条目需要校对' : '没有可校对条目', 'info'); return; }
    overlayEditorState = { items, indexes, pos: 0, subject: currentSubject, onlyUnknown: !!onlyUnknown };
    showOverlayEditorModal(true);
    renderOverlayEditor();
}

function showOverlayEditorModal(show) {
    const el = document.getElementById('overlayEditorModal');
    if (!el) return;
    el.style.display = show ? 'flex' : 'none';
    const cb = document.getElementById('edFilterUnknown');
    if (show && cb && overlayEditorState) {
        cb.checked = !!overlayEditorState.onlyUnknown;
        cb.onchange = () => {
            if (!overlayEditorState) return;
            overlayEditorState.onlyUnknown = !!cb.checked;
            recomputeOverlayIndexes(overlayEditorState.onlyUnknown);
            renderOverlayEditor();
        };
    }
}

function getEditorCurrentItem() {
    if (!overlayEditorState) return null;
    const idx = overlayEditorState.indexes[overlayEditorState.pos];
    return { data: overlayEditorState.items[idx], idx };
}

function renderOverlayEditor() {
    const st = overlayEditorState; if (!st) return;
    const { data, idx } = getEditorCurrentItem();
    const head = document.getElementById('editorIndex');
    if (head) head.textContent = `${st.pos + 1} / ${st.indexes.length}（原始序号 ${idx + 1}）`;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : String(v); };
    const setSel = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v || 'essay'); };
    setSel('edType', data.type || 'essay');
    setVal('edQuestion', data.question || '');
    const opts = Array.isArray(data.options) ? data.options : [];
    setVal('edOptA', opts[0] || '');
    setVal('edOptB', opts[1] || '');
    setVal('edOptC', opts[2] || '');
    setVal('edOptD', opts[3] || '');
    setVal('edAnswer', data.answer || '');
    setVal('edAnswerText', data.answerText || '');
    const unk = document.getElementById('edUnknown'); if (unk) unk.checked = !!data._unknown;
    const src = document.getElementById('edSource');
    if (src) {
        const joined = [data.question, ...(opts.filter(Boolean).map((t,i)=>`${String.fromCharCode(65+i)}、${t}`)), data.answer ? `答案: ${data.answer}` : '', data.answerText || ''].filter(Boolean).join('\n');
        const prefer = (data && data._src && String(data._src).trim()) ? String(data._src) : joined;
        src.textContent = prefer;
    }
}

function recomputeOverlayIndexes(onlyUnknown) {
    const st = overlayEditorState; if (!st) return;
    const arr = [];
    st.items.forEach((it, i) => { if (!onlyUnknown || it._unknown) arr.push(i); });
    st.indexes = arr;
    if (st.pos >= st.indexes.length) st.pos = 0;
}

function saveOverlayEditorCurrent() {
    const st = overlayEditorState; if (!st) return;
    const { idx } = getEditorCurrentItem();
    const cur = getEditorCurrentItem();
    const prevData = cur && cur.data ? cur.data : {};
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const item = {
        id: prevData && prevData.id != null ? prevData.id : undefined,
        type: getVal('edType'),
        question: getVal('edQuestion'),
        options: [getVal('edOptA'), getVal('edOptB'), getVal('edOptC'), getVal('edOptD')].filter((v,i)=> i<4),
        answer: getVal('edAnswer'),
        answerText: getVal('edAnswerText')
    };
    if (item.id === undefined) delete item.id;
    const unk = document.getElementById('edUnknown');
    if (unk && !unk.checked) delete item._unknown; else if (unk && unk.checked) item._unknown = true;
    const srcEl = document.getElementById('edSource');
    const rawSrc = srcEl ? String(srcEl.textContent || '') : '';
    if (prevData && prevData._src) item._src = prevData._src; else if (rawSrc.trim()) item._src = rawSrc;
    st.items[idx] = item;
}

function prevOverlayEditor() {
    const st = overlayEditorState; if (!st) return;
    saveOverlayEditorCurrent();
    if (st.pos > 0) st.pos--;
    renderOverlayEditor();
}

function nextOverlayEditor() {
    const st = overlayEditorState; if (!st) return;
    saveOverlayEditorCurrent();
    if (st.pos < st.indexes.length - 1) st.pos++;
    renderOverlayEditor();
}

function applyOverlayEditor() {
    const st = overlayEditorState; if (!st) { showOverlayEditorModal(false); return; }
    saveOverlayEditorCurrent();
    localStorage.setItem(`overlay_${st.subject}`, JSON.stringify(st.items));
    showOverlayEditorModal(false);
    currentSubject = st.subject;
    refreshAfterOverlayChange();
    const subjName = (SUBJECTS[st.subject] && SUBJECTS[st.subject].name) ? SUBJECTS[st.subject].name : st.subject;
    persistSubjectToServer(st.subject, subjName, st.items).then((ok) => {
        if (ok) showToast('已保存校对结果并应用（已同步到服务器题库）', 'success');
        else showToast('已保存校对结果并应用（服务器同步失败，仅保存本地）', 'warn');
    }).catch(() => {
        showToast('已保存校对结果并应用（服务器同步失败，仅保存本地）', 'warn');
    });
}

function assignFromSelection(target) {
    const src = document.getElementById('edSource'); if (!src) return;
    const sel = window.getSelection();
    let txt = '';
    if (sel && sel.rangeCount) {
        const r = sel.getRangeAt(0);
        if (src.contains(r.commonAncestorContainer)) txt = String(r.toString()).trim();
    }
    const getType = () => {
        const el = document.getElementById('edType');
        return el ? String(el.value || '').toLowerCase() : 'essay';
    };
    const tp = getType();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    const normMulti = (s) => Array.from(new Set(String(s || '').toUpperCase().replace(/[^A-D]/g, '').split(''))).sort().join('');
    const normSingle = (s) => {
        const m = String(s || '').toUpperCase().match(/[A-D]/);
        return m ? m[0] : '';
    };
    const normJudge = (s) => {
        const raw = String(s || '').trim();
        const compact = raw.replace(/\s+/g, '');
        if (/^(?:A|对|正确|T|TRUE|是)$/i.test(compact)) return '正确';
        if (/^(?:B|错|错误|F|FALSE|否|不)$/i.test(compact)) return '错误';
        if (/正确|对/.test(raw)) return '正确';
        if (/错误|错/.test(raw)) return '错误';
        return '';
    };

    if (tp === 'judge' && (target === 'A' || target === 'B')) {
        set('edOptA', '正确');
        set('edOptB', '错误');
        set('edOptC', '');
        set('edOptD', '');
        return;
    }

    if (!txt) return;
    if (target === 'question') set('edQuestion', txt);
    if (target === 'A') set('edOptA', txt);
    if (target === 'B') set('edOptB', txt);
    if (target === 'C') set('edOptC', txt);
    if (target === 'D') set('edOptD', txt);
    if (target === 'answer') {
        if (tp === 'fill' || tp === 'essay') {
            set('edAnswer', '');
            set('edAnswerText', txt);
            return;
        }
        if (tp === 'judge') {
            const j = normJudge(txt);
            if (j) set('edAnswer', j);
            else set('edAnswer', txt.replace(/\s+/g, ''));
            return;
        }
        if (tp === 'multiple') {
            const m = normMulti(txt);
            if (m) set('edAnswer', m);
            else set('edAnswer', txt.replace(/\s+/g, ''));
            return;
        }
        if (tp === 'single') {
            const s = normSingle(txt);
            if (s) set('edAnswer', s);
            else set('edAnswer', txt.replace(/\s+/g, ''));
            return;
        }
        const any = normMulti(txt);
        if (any) set('edAnswer', any);
        else set('edAnswer', txt.replace(/\s+/g, ''));
    }
    if (target === 'answerText') set('edAnswerText', txt);
}

function autoAssignFromSource() {
    const src = document.getElementById('edSource');
    if (!src) return;
    const raw = String(src.textContent || '');
    if (!raw.trim()) { showToast('没有可识别的原文', 'warn'); return; }

    function parseSingleBlockBestEffort(text) {
        const normMulti = (s) => Array.from(new Set(String(s || '').toUpperCase().replace(/[^A-D]/g, '').split(''))).sort().join('');
        const normSingle = (s) => {
            const m = String(s || '').toUpperCase().match(/[A-D]/);
            return m ? m[0] : '';
        };
        const normJudge = (s) => {
            const raw2 = String(s || '').trim();
            const compact = raw2.replace(/\s+/g, '');
            if (/^(?:A|对|正确|T|TRUE|是)$/i.test(compact)) return '正确';
            if (/^(?:B|错|错误|F|FALSE|否|不)$/i.test(compact)) return '错误';
            if (/正确|对/.test(raw2)) return '正确';
            if (/错误|错/.test(raw2)) return '错误';
            return '';
        };

        const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').map(s => String(s || '').trim()).filter(Boolean);
        if (!lines.length) return null;
        let question = '';
        const opts = [];
        let answerRaw = '';
        const desc = [];
        let stage = 'question';

        const isAnsLine = (s) => /^(?:答案|正确答案|参考答案|我的答案)\s*[:：]/.test(s);
        const parseAns = (s) => {
            const m = String(s || '').match(/^(?:答案|正确答案|参考答案|我的答案)\s*[:：]\s*(.*)$/);
            return m ? String(m[1] || '').trim() : '';
        };

        for (const ln of lines) {
            if (!answerRaw && isAnsLine(ln)) {
                answerRaw = parseAns(ln);
                continue;
            }
            const mOpt = ln.match(/^\s*[（(]?([A-Da-d])[）)]?[\.、:)]\s*(.*)$/);
            if (mOpt) {
                stage = 'options';
                opts.push(String(mOpt[2] || '').trim());
                continue;
            }
            if (stage === 'options' && opts.length > 0) {
                opts[opts.length - 1] = String((opts[opts.length - 1] || '') + ' ' + ln).trim();
                continue;
            }
            if (stage === 'question') {
                question = question ? (question + ' ' + ln) : ln;
                continue;
            }
            desc.push(ln);
        }

        let type = 'essay';
        let answer = '';
        let answerText = '';

        const maybeJudge = normJudge(answerRaw);
        if (maybeJudge) {
            type = 'judge';
            answer = maybeJudge;
        } else {
            const letters = normMulti(answerRaw);
            if (letters) {
                type = letters.length > 1 ? 'multiple' : 'single';
                answer = letters.length === 1 ? normSingle(letters) : letters;
            }
        }

        if (opts.filter(Boolean).length >= 2) {
            if (type === 'essay') type = 'single';
        } else {
            if (type !== 'judge') {
                type = 'essay';
                answerText = answerRaw || desc.join('\n');
                answer = '';
            }
        }

        const item = { type, question: question || lines[0] };
        if (opts.filter(Boolean).length >= 2) item.options = [opts[0] || '', opts[1] || '', opts[2] || '', opts[3] || ''];
        if (answer) item.answer = answer;
        if (answerText) item.answerText = answerText;
        item._src = String(text || '');
        const low = !item.question || (item.type === 'single' || item.type === 'multiple') && (!item.options || item.options.filter(Boolean).length < 2);
        if (low) item._unknown = true;
        return item;
    }

    let used = 'unknown';
    const pick = () => {
        try {
            const arr = parseTextToOverlayItems(raw) || [];
            const first = arr[0];
            if (first && first.question && (first.answer || first.answerText || (first.options && first.options.filter(Boolean).length >= 2)) && !first._unknown) {
                used = 'parser';
                return first;
            }
        } catch {}
        const fb = parseSingleBlockBestEffort(raw);
        if (fb) used = 'fallback';
        return fb;
    };

    const it = pick();
    if (!it) { showToast('未能自动识别，请手动取词', 'warn'); return; }
    if (used === 'fallback') {
        showToast('自动取词：已启用兜底解析（更适合编辑器原文块）', 'info', 2500);
    }
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : String(v); };
    const setSel = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v || 'essay'); };
    const normMulti = (s) => Array.from(new Set(String(s || '').toUpperCase().replace(/[^A-D]/g, '').split(''))).sort().join('');
    const normJudge = (s) => {
        const raw2 = String(s || '').trim();
        const compact = raw2.replace(/\s+/g, '');
        if (/^(?:A|对|正确|T|TRUE|是)$/i.test(compact)) return '正确';
        if (/^(?:B|错|错误|F|FALSE|否|不)$/i.test(compact)) return '错误';
        if (/正确|对/.test(raw2)) return '正确';
        if (/错误|错/.test(raw2)) return '错误';
        return '';
    };
    setSel('edType', it.type || 'essay');
    set('edQuestion', it.question || '');
    const opts = Array.isArray(it.options) ? it.options : [];
    set('edOptA', opts[0] || '');
    set('edOptB', opts[1] || '');
    set('edOptC', opts[2] || '');
    set('edOptD', opts[3] || '');
    const tp = String(it.type || 'essay').toLowerCase();
    if (tp === 'judge') {
        set('edOptA', '正确');
        set('edOptB', '错误');
        set('edOptC', '');
        set('edOptD', '');
        const j = normJudge(it.answer);
        set('edAnswer', j || it.answer || '');
    } else if (tp === 'multiple') {
        const m = normMulti(it.answer);
        set('edAnswer', m || it.answer || '');
    } else {
        set('edAnswer', it.answer || '');
    }
    set('edAnswerText', it.answerText || '');
    const unk = document.getElementById('edUnknown'); if (unk) unk.checked = !!it._unknown;
    if (it._unknown) {
        showToast('自动取词结果置信度偏低：建议手动框选补全题干/选项/答案', 'warn', 3500);
    }
}

function autoAssignBatchUnknown() {
    const st = overlayEditorState; if (!st) return;
    if (!st.indexes || !st.indexes.length) { showToast('没有可批量处理的条目', 'info'); return; }
    const ok = confirm(`将对 ${st.indexes.length} 条条目尝试自动取词（不会立即保存），继续？`);
    if (!ok) return;
    let changed = 0;
    for (const pos of st.indexes) {
        const prev = st.items[pos];
        if (!prev) continue;
        const joined = [prev.question, ...((Array.isArray(prev.options)?prev.options:[]).map((t,i)=>`${String.fromCharCode(65+i)}、${t}`)), prev.answer?`答案: ${prev.answer}`:'', prev.answerText||''].filter(Boolean).join('\n');
        const raw = String(prev._src || joined);
        let it = null;
        try {
            const arr = parseTextToOverlayItems(raw) || [];
            it = arr[0];
            if (it && it._unknown) it = null;
        } catch {}
        if (!it) {
            try {
                const lines = String(raw || '').replace(/\r\n?/g, '\n').split('\n').map(s => String(s || '').trim()).filter(Boolean);
                if (lines.length) {
                    let question = '';
                    const opts = [];
                    let answerRaw = '';
                    const desc = [];
                    let stage = 'question';
                    const isAnsLine = (s) => /^(?:答案|正确答案|参考答案|我的答案)\s*[:：]/.test(s);
                    const parseAns = (s) => {
                        const m = String(s || '').match(/^(?:答案|正确答案|参考答案|我的答案)\s*[:：]\s*(.*)$/);
                        return m ? String(m[1] || '').trim() : '';
                    };
                    for (const ln of lines) {
                        if (!answerRaw && isAnsLine(ln)) { answerRaw = parseAns(ln); continue; }
                        const mOpt = ln.match(/^\s*[（(]?([A-Da-d])[）)]?[\.、:)]\s*(.*)$/);
                        if (mOpt) { stage = 'options'; opts.push(String(mOpt[2] || '').trim()); continue; }
                        if (stage === 'options' && opts.length > 0) { opts[opts.length - 1] = String((opts[opts.length - 1] || '') + ' ' + ln).trim(); continue; }
                        if (stage === 'question') { question = question ? (question + ' ' + ln) : ln; continue; }
                        desc.push(ln);
                    }
                    const normMulti = (s) => Array.from(new Set(String(s || '').toUpperCase().replace(/[^A-D]/g, '').split(''))).sort().join('');
                    const normJudge = (s) => {
                        const raw2 = String(s || '').trim();
                        const compact = raw2.replace(/\s+/g, '');
                        if (/^(?:A|对|正确|T|TRUE|是)$/i.test(compact)) return '正确';
                        if (/^(?:B|错|错误|F|FALSE|否|不)$/i.test(compact)) return '错误';
                        if (/正确|对/.test(raw2)) return '正确';
                        if (/错误|错/.test(raw2)) return '错误';
                        return '';
                    };
                    let type = 'essay';
                    let answer = '';
                    let answerText = '';
                    const j = normJudge(answerRaw);
                    if (j) { type = 'judge'; answer = j; }
                    else {
                        const letters = normMulti(answerRaw);
                        if (letters) { type = letters.length > 1 ? 'multiple' : 'single'; answer = letters; }
                    }
                    if (opts.filter(Boolean).length >= 2) {
                        if (type === 'essay') type = 'single';
                    } else {
                        if (type !== 'judge') { type = 'essay'; answerText = answerRaw || desc.join('\n'); answer = ''; }
                    }
                    it = { type, question: question || lines[0], options: [opts[0]||'', opts[1]||'', opts[2]||'', opts[3]||''], answer, answerText, _src: raw };
                }
            } catch {}
        }
        if (!it) continue;
        const merged = {
            ...prev,
            type: it.type || prev.type || 'essay',
            question: it.question || prev.question || '',
            options: it.options || prev.options,
            answer: it.answer || prev.answer,
            answerText: it.answerText || prev.answerText,
            _src: prev._src || raw
        };
        if (it._unknown) merged._unknown = true; else delete merged._unknown;
        st.items[pos] = merged;
        changed++;
    }
    renderOverlayEditor();
    showToast(`已自动解析 ${changed} 条，请核对后点击“保存并应用”以生效`, 'success');
}

function escapeHTML(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

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
    },
    speech: {
        name: '语音识别',
        getQuestions: () => [
            ...(typeof questionsSpeech !== 'undefined' ? questionsSpeech : [])
        ]
    },
    dip: {
        name: '数字图像处理',
        getQuestions: () => [
            ...(typeof questionsDip !== 'undefined' ? questionsDip : [])
        ]
    }
};

const DEFAULT_SUBJECT_KEYS = new Set(['ai','exchange','linux','speech','dip']);
const DYNAMIC_SUBJECT_BASE = new Map();
const BUNDLED_IMPORTS = {
    ai_microcert: {
        subject: 'ai_microcert',
        name: 'AI 微认证',
        file: 'materials/ai-microcert.pdf',
        dataFile: 'custom/subject_ai_microcert.json',
        mode: 'json'
    },
    openeuler_microcert: {
        subject: 'openeuler_microcert',
        name: 'openEuler 微认证',
        file: 'materials/openeuler-microcert.pdf',
        dataFile: 'custom/subject_openeuler_microcert.json',
        mode: 'json'
    },
    ai_upgrade_exam: {
        subject: 'ai_upgrade_exam',
        name: 'AI 升级考试题',
        file: 'materials/ai-upgrade-exam.pdf',
        dataFile: 'custom/subject_ai_upgrade_exam.json',
        mode: 'json'
    },
    comm_net_1_3: {
        subject: 'comm_net_1_3',
        name: '通信网络技术 第1-3章',
        file: 'materials/comm-net-ch1-3.pdf',
        dataFile: 'custom/subject_comm_net_1_3.json',
        mode: 'json'
    },
    comm_net_4_5: {
        subject: 'comm_net_4_5',
        name: '通信网络技术 第4-5章',
        file: 'materials/comm-net-ch4-5.pdf',
        dataFile: 'custom/subject_comm_net_4_5.json',
        mode: 'json'
    },
    ic_design: {
        subject: 'ic_design',
        name: '集成电路设计基础',
        file: 'materials/ic-design.pdf',
        dataFile: 'custom/subject_ic_design.json',
        mode: 'pdf'
    },
    android: {
        subject: 'android',
        name: 'Android系统开发基础',
        file: 'materials/android.txt',
        dataFile: 'custom/subject_android.json',
        mode: 'json'
    }
};

function registerSubject(subjectKey, displayName) {
    const key = String(subjectKey || '').trim().toLowerCase();
    if (!key || SUBJECTS[key]) return false;
    DYNAMIC_SUBJECT_BASE.set(key, DYNAMIC_SUBJECT_BASE.get(key) || []);
    SUBJECTS[key] = {
        name: String(displayName || key),
        getQuestions: () => DYNAMIC_SUBJECT_BASE.get(key) || []
    };
    updateSubjectButtons();
    return true;
}

function ensureCurrentSubjectAvailable() {
    const key = String(currentSubject || '').trim().toLowerCase();
    if (key && SUBJECTS[key]) return;
    const bundled = key ? BUNDLED_IMPORTS[key] : null;
    if (bundled) {
        registerSubject(bundled.subject, bundled.name);
        currentSubject = bundled.subject;
        localStorage.setItem('currentSubject', currentSubject);
        return;
    }
    currentSubject = 'ai';
    localStorage.setItem('currentSubject', currentSubject);
}

async function persistSubjectToServer(subjectKey, displayName, items) {
    try {
        const key = String(subjectKey || '').trim().toLowerCase();
        const name = String(displayName || key || '').trim() || key;
        const arr = Array.isArray(items) ? items : [];
        const v = validateOverlayItems(arr, key);
        const payload = { subject: key, name, items: v.items || [] };
        const res = await fetch(`custom/upload?name=subject_${encodeURIComponent(key)}.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            cache: 'no-store'
        });
        if (!res.ok) return false;
        const data = await res.json().catch(() => null);
        if (data && data.ok === false) return false;
        return true;
    } catch (e) {
        return false;
    }
}

function promptAddSubject() {
    let key = prompt('请输入学科英文 key（例如 datastruct）') || '';
    key = String(key).trim().toLowerCase();
    if (!key) return;
    if (!/^[a-z0-9_-]{2,32}$/.test(key)) { showToast('学科 key 需为 2-32 位小写字母、数字、下划线或短横线', 'warn'); return; }
    let name = prompt('请输入学科显示名') || key;
    name = String(name).trim() || key;
    const created = registerSubject(key, name);
    if (created) {
        switchSubject(key);
        persistSubjectToServer(key, name).then(() => discoverSubjectsFromServer()).catch(() => {});
    }
    else showToast('学科已存在或创建失败', 'error');
}

async function discoverSubjectsFromServer() {
    const idx = await fetchJsonSafe('custom/index.json');
    if (!idx || !Array.isArray(idx.files)) return;
    for (const f of idx.files) {
        const data = await fetchJsonSafe(`custom/${encodeURIComponent(f.name)}`);
        if (data && data.subject) {
            const key = String(data.subject).toLowerCase();
            if (!SUBJECTS[key]) registerSubject(key, data.name ? String(data.name) : key);
        }
    }
}

function refreshAfterOverlayChange() {
    allQuestions = SUBJECTS[currentSubject].getQuestions();
    originalQuestions = [...allQuestions];
    const proceed = () => {
        renderQuestionNav();
        showQuestion();
        updateStats();
        updateSubjectStatus();
    };
    applyOverlaysForSubject(currentSubject).then(proceed).catch(proceed);
}

function bindCspSafeEvents() {
    // 科目切换
    document.querySelectorAll('[data-subject-btn]').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-subject');
            if (key) switchSubject(key);
        });
    });
    const addBtn = document.querySelector('[data-subject-add]');
    if (addBtn) addBtn.addEventListener('click', () => promptAddSubject());

    // 模式切换
    document.querySelectorAll('.mode-btn[data-mode]').forEach(btn => {
        btn.addEventListener('click', () => {
            const m = btn.getAttribute('data-mode');
            if (m === 'wrong-ext') { switchMode('wrong', btn); return; }
            switchMode(m, btn);
        });
    });

    // 工具栏绑定
    const byId = (id) => document.getElementById(id);
    const map = [
        ['importDocBtn', () => importWordPdf()],
        ['importBundledAiBtn', () => importBundledSubject('ai_microcert')],
        ['importBundledOpenEulerBtn', () => importBundledSubject('openeuler_microcert')],
        ['importBundledAiUpgradeBtn', () => importBundledSubject('ai_upgrade_exam')],
        ['importBundledCommNet13Btn', () => importBundledSubject('comm_net_1_3')],
        ['importBundledCommNet45Btn', () => importBundledSubject('comm_net_4_5')],
        ['importBundledIcDesignBtn', () => importBundledSubject('ic_design')],
        ['importBundledAndroidBtn', () => importBundledSubject('android')],
        ['openOverlayEditorBtn', () => openOverlayEditor(true)],
        ['importOverlayLocalBtn', () => importOverlayFromFile()],
        ['importOverlayServerBtn', () => importOverlayToServer()],
        ['exportOverlayBtn', () => exportOverlay()],
        ['clearOverlayBtn', () => clearOverlay()],
        ['jumpBtn', () => jumpToQuestion()],
        ['shuffleOptionsBtn', () => shuffleCurrentOptions()],
        ['showAnswerBtn', () => showAnswer()],
        ['prevBtn', () => previousQuestion()],
        ['nextBtn', () => nextQuestion()],
        ['mbPrevBtn', () => previousQuestion()],
        ['mbShowBtn', () => showAnswer()],
        ['mbNextBtn', () => nextQuestion()],
        ['collectBtn', () => { const q = allQuestions[currentIndex]; if (q) { toggleCollectQuestion(q.id); updateCollectButton(); } }],
        ['shuffleQuestionsBtn', () => goRandomQuestion()],
        ['resetProgressBtn', () => resetProgress()],
        ['exitReviewBtn', () => exitReviewMode()],
        ['clearCollectedBtn', () => clearCollectedQuestions()],
        ['reviewWrongBtn', () => reviewWrongQuestions()],
        ['clearWrongBtn', () => clearWrongQuestions()],
        ['exportStatsBtn', () => exportStats()],
        ['resetAllBtn', () => resetAllData()],
    ];
    map.forEach(([id, fn]) => { const el = byId(id); if (el) el.addEventListener('click', fn); });

    // 文件选择
    const overlayFileInput = byId('overlayFileInput');
    if (overlayFileInput) overlayFileInput.addEventListener('change', (e) => handleOverlayFileChange(e));
    const overlayUploadInput = byId('overlayUploadInput');
    if (overlayUploadInput) overlayUploadInput.addEventListener('change', (e) => handleOverlayUploadFileChange(e));
    const docFileInput = byId('docFileInput');
    if (docFileInput) docFileInput.addEventListener('change', (e) => handleWordPdfFileChange(e));

    // 搜索
    const search = byId('searchInput');
    if (search) search.addEventListener('input', () => filterQuestions());

    // 题型过滤
    document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tp = btn.getAttribute('data-filter') || 'all';
            filterByType(tp, btn);
        });
    });

    // 覆盖层编辑器按钮
    document.querySelectorAll('button[data-assign]').forEach(b => {
        b.addEventListener('click', () => {
            const key = b.getAttribute('data-assign');
            if (key) assignFromSelection(key);
        });
    });
    const bindIf = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    bindIf('autoAssignOneBtn', () => autoAssignFromSource());
    bindIf('autoAssignBatchBtn', () => autoAssignBatchUnknown());
    bindIf('prevEditorBtn', () => prevOverlayEditor());
    bindIf('nextEditorBtn', () => nextOverlayEditor());
    bindIf('applyOverlayEditorBtn', () => applyOverlayEditor());
    bindIf('cancelOverlayEditorBtn', () => showOverlayEditorModal(false));

    const edType = byId('edType');
    if (edType) {
        edType.addEventListener('change', () => {
            const tp = String(edType.value || '').toLowerCase();
            if (tp !== 'judge') return;
            const a = byId('edOptA');
            const b = byId('edOptB');
            const c = byId('edOptC');
            const d = byId('edOptD');
            if (a) a.value = '正确';
            if (b) b.value = '错误';
            if (c) c.value = '';
            if (d) d.value = '';
        });
    }
}

function updateSubjectStatus() {
    const el = document.getElementById('subjectStatus'); if (!el) return;
    const name = SUBJECTS[currentSubject] && SUBJECTS[currentSubject].name ? SUBJECTS[currentSubject].name : currentSubject;
    const total = allQuestions.length || 0;
    const key = `overlay_${currentSubject}`;
    const raw = localStorage.getItem(key);
    let overlayCount = 0, unknown = 0;
    if (raw) {
        try {
            const j = JSON.parse(raw);
            const arr = Array.isArray(j) ? j : (j && Array.isArray(j.items) ? j.items : []);
            overlayCount = Array.isArray(arr) ? arr.length : 0;
            unknown = Array.isArray(arr) ? arr.reduce((n, it) => n + (it && it._unknown ? 1 : 0), 0) : 0;
        } catch {}
    }
    el.style.display = 'flex';
    const info = overlayCount ? `${name} · 题目 ${total} · 覆盖层 ${overlayCount}（低置信度 ${unknown}）` : `${name} · 题目 ${total}`;
    // 安全渲染，避免 name 中出现潜在的 HTML 片段
    el.innerHTML = '';
    const left = document.createElement('div');
    left.textContent = info;
    const right = document.createElement('div');
    const btn1 = document.createElement('button');
    btn1.className = 'mini-btn';
    btn1.textContent = '校对';
    btn1.onclick = () => openOverlayEditor(true);
    const btn2 = document.createElement('button');
    btn2.className = 'mini-btn';
    btn2.textContent = '导出';
    btn2.onclick = () => exportOverlay();
    right.appendChild(btn1);
    right.appendChild(btn2);
    el.appendChild(left);
    el.appendChild(right);
}

// ================= Word/PDF/TXT 导入 =================
function importWordPdf() {
    const inp = document.getElementById('docFileInput');
    if (inp) inp.click();
}

async function extractTextFromPdfBuffer(arrayBuf) {
    if (typeof window.pdfjsLib === 'undefined') {
        throw new Error('pdfjs_unavailable');
    }
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuf }).promise;
    let text = '';
    const buildLine = (parts) => {
        const sorted = parts
            .filter(it => it && typeof it.str === 'string' && it.str.trim())
            .sort((a, b) => a.x - b.x);
        let line = '';
        let prevEnd = null;
        for (const part of sorted) {
            const seg = String(part.str || '').trim();
            if (!seg) continue;
            const x = Number(part.x || 0);
            const width = Number(part.width || 0);
            if (line && prevEnd != null) {
                const gap = x - prevEnd;
                if (gap > 1.5) line += ' ';
            }
            line += seg;
            prevEnd = x + width;
        }
        return line.trim();
    };
    for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        const rows = [];
        for (const item of content.items || []) {
            const str = String((item && item.str) || '');
            if (!str.trim()) continue;
            const x = Number(item && item.transform ? item.transform[4] : 0) || 0;
            const y = Number(item && item.transform ? item.transform[5] : 0) || 0;
            const h = Number(item && item.height) || 0;
            const tol = Math.max(1.2, Math.min(3, h * 0.35 || 1.5));
            let row = null;
            for (const r of rows) {
                if (Math.abs(r.y - y) <= r.tol) { row = r; break; }
            }
            if (!row) {
                row = { y, tol, parts: [] };
                rows.push(row);
            } else {
                row.y = (row.y * row.parts.length + y) / (row.parts.length + 1);
                row.tol = Math.max(row.tol, tol);
            }
            row.parts.push({ str, x, width: Number(item.width || 0) || 0 });
        }
        rows.sort((a, b) => b.y - a.y);
        const pageLines = rows.map(r => buildLine(r.parts)).filter(Boolean);
        text += pageLines.join('\n') + '\n';
    }
    return text;
}

async function importBundledSubject(resourceKey) {
    const meta = BUNDLED_IMPORTS[resourceKey];
    if (!meta) {
        showToast('未找到内置资料', 'error');
        return;
    }
    if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
        showToast('请先用本地服务打开项目，再使用内置资料一键导入', 'warn', 4500);
        return;
    }
    try {
        setLoading(true, `正在载入 ${meta.name} 题库…`);
        if (meta.mode === 'pdf') {
            if (typeof window.pdfjsLib === 'undefined') {
                showToast('当前离线环境未内置 PDF 解析库，无法读取内置 PDF 题库', 'error');
                return;
            }
            const prevSubject = currentSubject;
            if (!SUBJECTS[meta.subject]) registerSubject(meta.subject, meta.name);
            const res = await fetch(meta.file, { cache: 'no-store' });
            if (!res.ok) {
                showToast(`未能读取 ${meta.name} 的 PDF`, 'warn');
                return;
            }
            const arrayBuf = await res.arrayBuffer();
            const text = await extractTextFromPdfBuffer(arrayBuf);
            setLoading(false);
            switchSubject(meta.subject);
            const applied = await importFromPlainText(text);
            if (!applied && prevSubject !== meta.subject && SUBJECTS[prevSubject]) {
                switchSubject(prevSubject);
            }
            return;
        }
        if (!SUBJECTS[meta.subject]) registerSubject(meta.subject, meta.name);
        const data = await fetchJsonSafe(meta.dataFile);
        if (!data || !Array.isArray(data.items)) {
            showToast(`未能读取 ${meta.name} 的内置题库`, 'warn');
            return;
        }
        const v = validateOverlayItems(data.items, meta.subject);
        if (!v.items || v.items.length === 0) {
            showToast(`${meta.name} 的内置题库未通过校验`, 'warn');
            return;
        }
        localStorage.setItem(`overlay_${meta.subject}`, JSON.stringify(v.items));
        switchSubject(meta.subject);
        showToast(`已载入 ${meta.name} 稳定题库：${v.items.length} 条`, 'success', 4500);
    } catch (err) {
        showToast(`载入 ${meta.name} 失败`, 'error');
    } finally {
        setLoading(false);
    }
}

async function handleWordPdfFileChange(e) {
    const file = e && e.target && e.target.files && e.target.files[0];
    if (!file) return;
    const name = file.name || '';
    const lower = name.toLowerCase();
    try {
        setLoading(true, '正在识别文档…');
        if (lower.endsWith('.txt') || lower.endsWith('.md')) {
            const text = await file.text();
            await importFromPlainText(text);
        } else if (lower.endsWith('.docx')) {
            if (typeof window.mammoth === 'undefined') {
                showToast('当前离线环境未内置 Word 解析库。可先将 Word 另存为纯文本，或上传覆盖层 JSON。', 'error');
                return;
            }
            const arrayBuf = await file.arrayBuffer();
            const result = await window.mammoth.extractRawText({ arrayBuffer: arrayBuf });
            await importFromPlainText(result && result.value ? result.value : '');
        } else if (lower.endsWith('.pdf')) {
            if (typeof window.pdfjsLib === 'undefined') {
                showToast('当前离线环境未内置 PDF 解析库。可先将 PDF 导出为纯文本，或上传覆盖层 JSON。', 'error');
                return;
            }
            const arrayBuf = await file.arrayBuffer();
            const text = await extractTextFromPdfBuffer(arrayBuf);
            await importFromPlainText(text);
        } else {
            showToast('暂不支持的文件类型，请选择 .docx / .pdf / .txt / .md', 'error');
        }
    } catch (err) {
        showToast('导入失败', 'error');
    } finally {
        setLoading(false);
        e.target.value = '';
    }
}

async function importFromPlainText(text) {
    const templateLabels = {
        auto: '自动（通用）',
        platform_export: '平台导出（我的答案/正确答案/分值/答案解析）',
        choice_ad: '选择题 A-D（无类型标注）',
        judge_ab: '判断题 A/B（A=正确，B=错误）'
    };
    const profileKey = `import_profile_${currentSubject}`;
    let template = 'auto';
    try {
        const raw = localStorage.getItem(profileKey);
        if (raw) {
            const prof = JSON.parse(raw);
            if (prof && typeof prof.template === 'string' && templateLabels[prof.template]) template = prof.template;
        }
    } catch {}

    const chooseMsg = `请选择导入模板（学科：${SUBJECTS[currentSubject].name}）\n\n1) ${templateLabels.auto}\n2) ${templateLabels.platform_export}\n3) ${templateLabels.choice_ad}\n4) ${templateLabels.judge_ab}\n\n回车保持：${templateLabels[template]}\n请输入 1-4（取消则终止导入）：`;
    const choose = prompt(chooseMsg, '');
    if (choose === null) return false;
    const t = String(choose || '').trim();
    if (t) {
        const map = { '1': 'auto', '2': 'platform_export', '3': 'choice_ad', '4': 'judge_ab' };
        if (map[t]) template = map[t];
        try { localStorage.setItem(profileKey, JSON.stringify({ template, updatedAt: new Date().toISOString() })); } catch {}
    }

    const items = parseTextToOverlayItems(text, { template });
    if (!items || items.length === 0) {
        showToast('未识别到题目，请检查格式或先转为 TXT 再试', 'warn');
        return false;
    }
    const unknownCount = items.reduce((n, it) => n + (it && it._unknown ? 1 : 0), 0);
    const withOpts = items.reduce((n, it) => n + (it && Array.isArray(it.options) && it.options.filter(Boolean).length >= 2 ? 1 : 0), 0);
    const withAns = items.reduce((n, it) => n + (it && ((it.answer && String(it.answer).trim()) || (it.answerText && String(it.answerText).trim())) ? 1 : 0), 0);
    const types = items.reduce((m, it) => { const k = (it && it.type) ? String(it.type) : 'unknown'; m[k] = (m[k] || 0) + 1; return m; }, {});
    const typeLine = Object.keys(types).sort().map(k => `${k}:${types[k]}`).join('  ');
    const ratio = items.length ? (unknownCount / items.length) : 0;
    const sample = items.slice(0, 3).map((it, idx) => {
        const head = `${idx + 1}. [${it.type}] ${String(it.question || '').slice(0, 50)}`;
        const opts = Array.isArray(it.options) ? it.options.filter(Boolean).map((tt, i) => `  ${String.fromCharCode(65+i)}、${String(tt).slice(0, 40)}`).join('\n') : '';
        const ans = it.answer ? `  答案: ${it.answer}` : (it.answerText ? `  参考: ${String(it.answerText).slice(0, 40)}` : '');
        const mark = it._unknown ? '  ⚠ 低置信度' : '';
        return [head, opts, ans, mark].filter(Boolean).join('\n');
    }).join('\n\n');
    const report = `模板：${templateLabels[template] || template}\n识别：${items.length} 条（低置信度 ${unknownCount} 条，${Math.round(ratio*100)}%）\n带选项：${withOpts} 条  带答案/参考：${withAns} 条\n类型：${typeLine}`;
    const confirmMsg = `${report}\n\n样例：\n${sample}\n\n是否应用到学科：${SUBJECTS[currentSubject].name}？`;
    const ok = confirm(confirmMsg);
    if (!ok) return false;
    localStorage.setItem(`overlay_${currentSubject}`, JSON.stringify(items));
    refreshAfterOverlayChange();
    let msg = `导入完成：识别 ${items.length} 条题目`;
    if (unknownCount > 0) msg += `（其中 ${unknownCount} 条需人工校对）`;
    if (unknownCount > 0) {
        const applied = Math.max(0, items.length - unknownCount);
        msg += `，已应用 ${applied} 条到 ${SUBJECTS[currentSubject].name}（低置信度条目不会进入练习，需校对后生效）`;
    } else {
        msg += `，已应用到 ${SUBJECTS[currentSubject].name}`;
    }
    showToast(msg + '（正在同步到服务器题库…）', 'success');
    persistSubjectToServer(currentSubject, SUBJECTS[currentSubject].name, items).then((synced) => {
        if (synced) showToast('已同步到服务器题库', 'success');
        else showToast('服务器同步失败，仅保存本地', 'warn');
    }).catch(() => {
        showToast('服务器同步失败，仅保存本地', 'warn');
    });
    if (ratio >= 0.3) {
        if (confirm(`当前识别低置信度较高（${Math.round(ratio*100)}%），是否立即打开“校对”面板？`)) {
            openOverlayEditor(true);
        }
    }
    return true;
}

function parseTextToOverlayItems(text, opt) {
    function toHalfWidth(str) {
        let out = '';
        for (let i = 0; i < str.length; i++) {
            const code = str.charCodeAt(i);
            if (code === 12288) out += ' ';
            else if (code >= 65281 && code <= 65374) out += String.fromCharCode(code - 65248);
            else out += str[i];
        }
        return out;
    }
    const template = (opt && opt.template) ? String(opt.template) : 'auto';
    const normalize = (s) => toHalfWidth(s.trim()).replace(/[．。]/g, '.').replace(/[：]/g, ':');
    const joinWrapped = (a, b) => {
        const left = String(a || '').trim();
        const right = String(b || '').trim();
        if (!left) return right;
        if (!right) return left;
        const last = left.slice(-1);
        const first = right.charAt(0);
        if (/[A-Za-z0-9\]]$/.test(last) && /^[A-Za-z0-9\[]/.test(first)) return `${left} ${right}`;
        return left + right;
    };
    const typeMap = {
        '单选题': 'single',
        '多选题': 'multiple',
        '判断题': 'judge',
        '填空题': 'fill',
        '简答题': 'essay',
        '论述题': 'essay'
    };
    const rawLines = String(text || '').replace(/\r\n?/g, '\n').split('\n').map(s => normalize(s));
    const stripOptionLabel = (s) => String(s || '').replace(/^\s*(?:选项|options?)\s*[:：]\s*/i, '');
    const dedupeLetters = (s) => Array.from(new Set(String(s || '').split(''))).sort().join('');
    const extractAnswerLetters = (s) => {
        const body = String(s || '').toUpperCase();
        const compact = body.replace(/[\s,，、;；/]+/g, '');
        if (/^[A-H]+$/.test(compact)) return dedupeLetters(compact);
        const out = [];
        const re = /(?:^|[^A-Z0-9])([A-H])(?=[\.\)、,，、:：;；\s]|$)/g;
        let m;
        while ((m = re.exec(body)) !== null) out.push(m[1]);
        return dedupeLetters(out.join(''));
    };
    const splitAnswerSuffix = (s) => {
        const ln = String(s || '').trim();
        if (!ln) return null;
        const m = ln.match(/^(.*?)(?:正确答案|参考答案|我的答案|答案是|答\s*案|Answer|Ans)\s*(?:[:：]|为)\s*(.*)$/i);
        if (m) return { before: String(m[1] || '').trim(), answer: String(m[2] || '').trim() };
        const startOnly = ln.match(/^(?:正确答案|参考答案|我的答案|答案是|答\s*案|Answer|Ans)\s+(.+)$/i);
        if (startOnly) return { before: '', answer: String(startOnly[1] || '').trim() };
        return null;
    };
    const normalizeAnswerBody = (s) => String(s || '')
        .replace(/^(?:正确答案|参考答案|我的答案|答案是|答\s*案|Answer|Ans)\s*(?:[:：]|为)?\s*/i, '')
        .replace(/^[:：]\s*/, '')
        .trim();
    const parseQuestionLead = (s) => {
        const raw = String(s || '').trim();
        if (!raw) return null;
        const typeLabel = ((raw.match(/(?:单选题|多选题|判断题|填空题|简答题|论述题)/) || [])[0]) || '';
        let body = raw
            .replace(/^[\s([{\]【（]*?(?:单选题|多选题|判断题|填空题|简答题|论述题)\s*[)\]】】}）【\s]*/i, '')
            .replace(/^\s*[【\[]?\s*试题\s*ID\s*[:：]?\s*\d+\s*[】\]]?\s*/i, '')
            .replace(/^\s*[)\]】】}）]+\s*/, '');
        const matched = body.match(/^(\d+)[\.\)、]\s*(.*)$/) || body.match(/(?:^|\s)(\d+)[\.\)、]\s*(.+)$/);
        if (!matched) return null;
        const idx = matched.index || 0;
        const question = String(matched[2] || '').trim();
        if (!question) return null;
        return {
            typeLabel,
            type: typeLabel ? typeMap[typeLabel] || '' : '',
            number: String(matched[1] || ''),
            question,
            raw: idx > 0 ? body.slice(idx).trim() : body
        };
    };
    const skipLine = (s) => {
        if (!s) return true;
        if (/^(?:单选题|多选题|判断题|填空题|简答题|论述题)$/.test(s)) return true;
        if (/^(?:答案解析|解析)\s*:?\s*$/.test(s)) return true;
        if (/升级考试/.test(s) && !parseQuestionLead(s)) return true;
        if (template === 'platform_export') {
            if (/^(?:\(?客观\)?\s*-?|\(?主观\)?\s*-?)/.test(s)) return true;
            if (/^[一二三四五六七八九十]+\s*[\.|、]?\s*(?:判断题|单选题|多选题|填空题|简答题|论述题)\b/.test(s)) return true;
            if (/^第\s*\d+\s*章/.test(s)) return true;
            if (/^\d+(?:\.\d+)?\s*分$/.test(s)) return true;
            if (/^(?:答案解析|解析)\s*:?$/.test(s)) return true;
        }
        return false;
    };
    const lines = rawLines.filter(s => !skipLine(s));
    const isQStart = (s) => !!parseQuestionLead(s) || /^\s*(?:\d+[\.、\)]\s*|[（(]\d+[）)]\s*|第\s*\d+\s*题|第[一二三四五六七八九十百]+\s*题|[一二三四五六七八九十百千]+[、\.)]\s*)/.test(s);
    const isOptAuto = (s) => /^\s*(?:[（(]?[A-Ha-h][）)]?[\.、:,)]\s*|[A-Ha-h]\s+)/.test(stripOptionLabel(s));
    const isOptChoice = (s) => /^\s*(?:[（(]?[A-Da-d][）)]?[\.、:,)]\s*|[A-Da-d]\s+)/.test(stripOptionLabel(s));
    const isOpt = (s) => (template === 'choice_ad' || template === 'judge_ab') ? isOptChoice(s) : isOptAuto(s);
    const isAns = (s) => !!splitAnswerSuffix(s);
    const inlineOptRe = /[（(]?([A-Ha-h])[）)]?[\.、:)]\s*/g;
    const stripAfterMarkers = (s) => {
        const m = String(s || '').match(/^(.*?)(?:\s*(?:我的答案|正确答案|参考答案|答案解析|解析)\s*[:：]|\s*\d+(?:\.\d+)?\s*分\b)/);
        return m ? m[1].trim() : String(s || '').trim();
    };
    function extractAnswerLine(s) {
        const split = splitAnswerSuffix(s);
        if (!split) return '';
        const payload = stripAfterMarkers(split.answer);
        if (payload) return '答案: ' + payload;
        return '';
    }
    function extractInlineOptions(s) {
        const pos = [];
        let m;
        while ((m = inlineOptRe.exec(s)) !== null) {
            pos.push({ letter: m[1].toUpperCase(), index: m.index, end: inlineOptRe.lastIndex });
        }
        if (pos.length < 2) return [];
        const out = [];
        for (let i = 0; i < pos.length; i++) {
            const start = pos[i].end;
            const stop = i + 1 < pos.length ? pos[i+1].index : s.length;
            out.push(s.slice(start, stop).trim());
        }
        return out;
    }
    const blocks = [];
    let cur = [];
    for (const ln of lines) {
        if (isQStart(ln) && cur.length > 0) {
            const curHasAnswer = cur.some(x => isAns(x));
            const curHasOption = cur.some(x => isOpt(x)) || extractInlineOptions(cur.join(' ')).length >= 2;
            const curLooksTitle = cur.length === 1 && !isQStart(cur[0]) && !curHasOption && !curHasAnswer;
            if (curLooksTitle || curHasAnswer) {
                blocks.push(cur);
                cur = [ln];
                continue;
            }
        }
        cur.push(ln);
    }
    if (cur.length) blocks.push(cur);
    const items = [];
    for (const b of blocks) {
        if (b.length === 0) continue;
        const first = b[0];
        const lead = parseQuestionLead(first);
        const firstIsQ = !!lead || isQStart(first);
        const typeHint = lead && lead.type ? lead.type : '';
        let qline = lead ? lead.question : first
            .replace(/^\s*\d+[\.、\)]\s*/, '')
            .replace(/^\s*[（(]\d+[）)]\s*/, '')
            .replace(/^第\s*\d+\s*题\s*/, '')
            .replace(/^第[一二三四五六七八九十百]+\s*题\s*/, '')
            .replace(/^[一二三四五六七八九十百千]+[、\.)]\s*/, '')
            .replace(/^\s*[（(][^）)]+题[）)]\s*/, '')
            .replace(/^[【\[]?\s*试题\s*ID\s*[:：]?\s*\d+\s*[】\]]?\s*/i, '')
            .trim();
        const other = b.slice(1);
        const opts = [];
        let answerLine = '';
        const desc = [];
        let stage = 'question';
        let awaitingAnswer = false;
        for (const ln0 of other) {
            let ln = String(ln0 || '').trim();
            if (!ln) continue;
            if (awaitingAnswer) {
                if (!isOpt(ln)) {
                    answerLine = '答案: ' + stripAfterMarkers(ln);
                    awaitingAnswer = false;
                    continue;
                }
                awaitingAnswer = false;
            }
            if (stage === 'question') {
                const mixed = ln.match(/^(.*?)(?:选项|options?)\s*[:：]\s*([A-Ha-h].*)$/i);
                if (mixed) {
                    const lead = String(mixed[1] || '').trim();
                    if (lead) qline = joinWrapped(qline, lead);
                    ln = '选项:' + String(mixed[2] || '').trim();
                }
            }
            const answerSplit = splitAnswerSuffix(ln);
            let pendingAnswerLine = '';
            if (answerSplit) {
                ln = answerSplit.before;
                if (answerSplit.answer) pendingAnswerLine = '答案: ' + stripAfterMarkers(answerSplit.answer);
                else awaitingAnswer = true;
            }
            if (!ln) {
                if (!answerLine && pendingAnswerLine) answerLine = pendingAnswerLine;
                continue;
            }
            if (isOpt(ln)) {
                stage = 'options';
                const optionLine = stripOptionLabel(ln);
                const cleaned = stripAfterMarkers(optionLine.replace(/^\s*[（(]?([A-Ha-h])[）)]?[\.、:,)]\s*/, ''));
                opts.push(cleaned);
                const extra = extractInlineOptions(optionLine);
                if (extra.length > 1) {
                    extra.slice(1).forEach(t => opts.push(stripAfterMarkers(t)));
                }
                if (!answerLine && pendingAnswerLine) answerLine = pendingAnswerLine;
                continue;
            }
            if (stage === 'options' && /^题目\s*[:：]/.test(ln)) {
                qline = joinWrapped(qline, ln.replace(/^题目\s*[:：]\s*/, ''));
                if (!answerLine && pendingAnswerLine) answerLine = pendingAnswerLine;
                continue;
            }
            if (stage === 'options' && opts.length > 0 && opts.length < 4) {
                const disguised = ln.match(/^\d+[\.、\)]\s*(.+)$/);
                if (disguised) {
                    opts.push(stripAfterMarkers(disguised[1]));
                    if (!answerLine && pendingAnswerLine) answerLine = pendingAnswerLine;
                    continue;
                }
            }
            if (stage === 'question') {
                qline = joinWrapped(qline, ln);
                if (!answerLine && pendingAnswerLine) answerLine = pendingAnswerLine;
                continue;
            }
            if (stage === 'options' && opts.length > 0) {
                opts[opts.length - 1] = stripAfterMarkers(joinWrapped(opts[opts.length - 1] || '', ln));
                if (!answerLine && pendingAnswerLine) answerLine = pendingAnswerLine;
                continue;
            }
            desc.push(ln);
            if (!answerLine && pendingAnswerLine) answerLine = pendingAnswerLine;
        }
        // 如果未识别出选项，尝试在合并文本中做行内切分
        if (opts.length < 2) {
            const joined = other.join(' ');
            const inl = extractInlineOptions(joined);
            if (inl.length >= 2) {
                inl.forEach(t => opts.push(stripAfterMarkers(t)));
            }
            if (!answerLine) {
                const picked2 = extractAnswerLine(joined);
                if (picked2) answerLine = picked2;
            }
        }
        let type = 'essay';
        let answer = '';
        let answerText = '';
        if (answerLine) {
            const body = normalizeAnswerBody(answerLine);
            if (/^(?:对|正确|T|TRUE)$/i.test(body)) { type = 'judge'; answer = '正确'; }
            else if (/^(?:错|错误|F|FALSE)$/i.test(body)) { type = 'judge'; answer = '错误'; }
            else {
                const letters = extractAnswerLetters(body);
                if (letters) {
                    if ((template === 'judge_ab' || typeHint === 'judge') && letters.length === 1 && (letters === 'A' || letters === 'B')) {
                        type = 'judge';
                        answer = letters === 'A' ? '正确' : '错误';
                    } else {
                        type = letters.length === 1 ? 'single' : 'multiple';
                        answer = letters;
                    }
                } else if (body) {
                    answerText = body;
                }
            }
        }
        if (typeHint === 'judge') {
            type = 'judge';
            if (answer === 'A') answer = '正确';
            else if (answer === 'B') answer = '错误';
            else if (!answer && /^(?:对|正确)$/i.test(answerText)) { answer = '正确'; answerText = ''; }
            else if (!answer && /^(?:错|错误)$/i.test(answerText)) { answer = '错误'; answerText = ''; }
        } else if (typeHint === 'multiple' && answer) {
            type = answer.length > 1 ? 'multiple' : 'single';
            if (answer.length === 1 && opts.length >= 2) type = 'single';
            if (answer.length > 1) type = 'multiple';
        } else if (typeHint === 'single' && opts.length >= 2) {
            type = answer && answer.length > 1 ? 'multiple' : 'single';
        }
        if (template === 'choice_ad' && type === 'essay' && opts.length >= 2) {
            type = 'single';
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
        item._src = b.join('\n');
        const lowConfidence = !firstIsQ || (!answerLine && opts.length === 0 && desc.length === 0) || !qline || (item.options && item.options.filter(Boolean).length < 2 && (type === 'single' || type === 'multiple'));
        if (lowConfidence) item._unknown = true;
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
            if (!items) { showToast('导入失败：JSON 格式不正确', 'error'); return; }
            const v = validateOverlayItems(items, subjectKey);
            if (!v.items || v.items.length === 0) { showToast('导入失败：结构校验未通过', 'error'); return; }
            if (!SUBJECTS[subjectKey]) registerSubject(subjectKey, data && data.name ? data.name : subjectKey);
            localStorage.setItem(`overlay_${subjectKey}`, JSON.stringify(v.items));
            refreshAfterOverlayChange();
            showToast(`导入成功，覆盖层已应用（有效 ${v.items.length}${v.errors && v.errors.length ? `，忽略 ${v.errors.length}` : ''}）`, 'success');
            if (subjectKey !== currentSubject && SUBJECTS[subjectKey]) {
                if (confirm(`已导入到学科 ${SUBJECTS[subjectKey].name}，是否切换查看？`)) {
                    switchSubject(subjectKey);
                }
            }
        } catch (err) {
            showToast('导入失败：JSON 解析错误', 'error');
        } finally {
            e.target.value = '';
        }
    };
    reader.readAsText(file);
}

function exportOverlay() {
    const key = `overlay_${currentSubject}`;
    const raw = localStorage.getItem(key) || localStorage.getItem('overlay_global');
    if (!raw) { showToast('当前科目暂无覆盖层可导出', 'warn'); return; }
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
    showToast('已清空当前科目的本地覆盖层', 'info');
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
            setLoading(true, '正在上传…');
            const text = String(reader.result || '');
            // 简单校验 JSON
            let parsed;
            try { parsed = JSON.parse(text); } catch { showToast('上传失败：JSON 解析错误', 'error'); e.target.value=''; return; }
            let items = null;
            let subjectKey = (parsed && parsed.subject) ? String(parsed.subject).toLowerCase() : currentSubject;
            if (Array.isArray(parsed)) items = parsed;
            else if (parsed && Array.isArray(parsed.items)) { items = parsed.items; if (parsed.subject) subjectKey = String(parsed.subject).toLowerCase(); }
            else { showToast('上传失败：JSON 结构错误', 'error'); e.target.value=''; return; }
            const v = validateOverlayItems(items, subjectKey);
            if (!v.items || v.items.length === 0) { showToast('上传失败：覆盖层结构校验未通过', 'error'); e.target.value=''; return; }
            const uploadPayload = Array.isArray(parsed) ? v.items : { subject: subjectKey, name: (parsed && parsed.name) || subjectKey, items: v.items };
            const name = encodeURIComponent(file.name.replace(/\s+/g, '_'));
            const res = await fetch(`custom/upload?name=${name}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(uploadPayload),
                cache: 'no-store'
            });
            if (!res.ok) { showToast('上传失败', 'error'); e.target.value=''; return; }
            const data = await res.json();
            if (!data.ok) { showToast('上传失败：' + (data.error || '未知错误'), 'error'); e.target.value=''; return; }
            refreshAfterOverlayChange();
            showToast(`上传成功，已写入服务器 custom/ 并应用（有效 ${v.items.length}${v.errors && v.errors.length ? `，忽略 ${v.errors.length}` : ''}）`, 'success');
        } catch (err) {
            showToast('上传失败', 'error');
        } finally {
            setLoading(false);
            e.target.value = '';
        }
    };
    reader.readAsText(file);
}

function setLoading(show, msg) {
    const el = document.getElementById('loadingOverlay'); if (!el) return;
    el.style.display = show ? 'flex' : 'none';
    const t = document.getElementById('loadingText'); if (t && typeof msg === 'string') t.textContent = msg;
}

function showToast(message, type = 'info', duration = 3000) {
    try {
        const container = document.getElementById('toastContainer');
        if (!container) { alert(String(message)); return; }
        const el = document.createElement('div');
        el.className = 'toast ' + (type || 'info');
        el.textContent = String(message);
        container.appendChild(el);
        const list = container.querySelectorAll('.toast');
        if (list.length > 5) {
            container.removeChild(list[0]);
        }
        const hideAfter = Math.max(1000, Number(duration) || 0);
        setTimeout(() => {
            el.style.transition = 'opacity .2s, transform .2s';
            el.style.opacity = '0';
            el.style.transform = 'translateY(-6px)';
            setTimeout(() => { try { el.remove(); } catch {} }, 220);
        }, hideAfter);
    } catch (e) {
        try { alert(String(message)); } catch {}
    }
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

function computeStableQuestionId(subjectKey, questionText) {
    const base = normalizeStr(String(questionText || ''));
    const seed = String(subjectKey || '').toLowerCase() + '|' + base;
    let h = 5381;
    for (let i = 0; i < seed.length; i++) {
        h = ((h << 5) + h) + seed.charCodeAt(i);
        h = h >>> 0;
    }
    return (h % 2000000000) + 1;
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

function validateOverlayItems(items, subjectKey) {
    const allowedTypes = new Set(['single','multiple','judge','fill','essay']);
    const out = [];
    const errors = [];
    const coerce = coerceQuestion;
    const limit = (s, n) => String(s == null ? '' : s).slice(0, n);
    const isLetter = (ch) => /^[A-D]$/.test(ch);
    const normAnsLetters = (s) => Array.from(new Set(String(s||'').toUpperCase().replace(/[^A-D]/g,''))).sort().join('');
    const isJudgeToken = (s) => s === '正确' || s === '错误';
    if (!Array.isArray(items)) return { items: [], errors: ['root:not_array'] };
    for (let i = 0; i < items.length; i++) {
        const raw = items[i];
        if (!raw || typeof raw !== 'object') { errors.push(`item${i}:not_object`); continue; }
        const it = coerce(raw);
        if (!allowedTypes.has(it.type)) { errors.push(`item${i}:bad_type`); continue; }
        it.question = limit(it.question || '', 500).trim();
        if (!it.question) { errors.push(`item${i}:empty_question`); continue; }
        let id = (raw && raw.id != null) ? raw.id : (it && it.id != null ? it.id : null);
        if (typeof id === 'string' && /^\d{1,18}$/.test(id)) id = parseInt(id, 10);
        if (!(typeof id === 'number' && Number.isFinite(id) && id > 0)) {
            id = computeStableQuestionId(subjectKey, it.question);
        }
        if (Array.isArray(it.options)) {
            it.options = it.options.map(x => limit(x, 200)).filter(Boolean).slice(0, 4);
        }
        if ((it.type === 'single' || it.type === 'multiple') && (!Array.isArray(it.options) || it.options.length < 2)) {
            errors.push(`item${i}:options_invalid`); continue;
        }
        if (it.type === 'single') {
            const a = String(it.answer || '').toUpperCase();
            if (!isLetter(a)) { errors.push(`item${i}:answer_invalid_single`); continue; }
            it.answer = a;
        } else if (it.type === 'multiple') {
            const a = normAnsLetters(it.answer);
            if (!a) { errors.push(`item${i}:answer_invalid_multiple`); continue; }
            it.answer = a;
        } else if (it.type === 'judge') {
            let a = String(it.answer || '').trim();
            if (/^(?:对|正确|T)$/i.test(a)) a = '正确';
            else if (/^(?:错|错误|F)$/i.test(a)) a = '错误';
            if (!isJudgeToken(a)) { errors.push(`item${i}:answer_invalid_judge`); continue; }
            it.answer = a;
            delete it.options;
        } else if (it.type === 'fill' || it.type === 'essay') {
            // 用 answerText 表述参考答案，answer 可为空
            it.answerText = limit(it.answerText || it.answer || '', 2000);
            delete it.answer;
        }
        // 严格字段白名单
        const clean = { id, type: it.type, question: it.question };
        if (Array.isArray(it.options) && it.options.length >= 2) clean.options = it.options;
        if (typeof it.answer === 'string' && it.answer) clean.answer = it.answer;
        if (typeof it.answerText === 'string' && it.answerText) clean.answerText = it.answerText;
        if (it._unknown) clean._unknown = true;
        if (subjectKey) clean.subject = subjectKey;
        out.push(clean);
    }
    return { items: out, errors };
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

async function fetchJsonSafe(url, timeoutMs = 8000) {
    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    let timer = null;
    try {
        if (controller) timer = setTimeout(() => { try { controller.abort(); } catch {} }, timeoutMs);
        const res = await fetch(url, { cache: 'no-store', signal: controller ? controller.signal : undefined });
        if (!res.ok) return null;
        const ct = String(res.headers.get('content-type') || '').toLowerCase();
        if (ct && ct.indexOf('application/json') === -1) return null;
        return await res.json();
    } catch (e) {
        return null;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

function getLocalOverlays(subjectKey) {
    const out = [];
    const key = `overlay_${subjectKey}`;
    const raw = localStorage.getItem(key);
    if (raw) {
        try {
            const json = JSON.parse(raw);
            if (Array.isArray(json)) out.push(json);
            else if (json && Array.isArray(json.items)) out.push(json.items);
        } catch {}
        return out;
    }

    const rawGlobal = localStorage.getItem('overlay_global');
    if (!rawGlobal) return out;

    let hasOtherOverlays = false;
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            if (k === 'overlay_global' || k === key) continue;
            if (/^overlay_[a-z0-9_-]+$/i.test(k)) { hasOtherOverlays = true; break; }
        }
    } catch {}

    try {
        const json = JSON.parse(rawGlobal);
        if (Array.isArray(json)) {
            const hasSubject = json.some(it => it && typeof it === 'object' && it.subject);
            if (hasSubject) {
                const picked = json.filter(it => it && typeof it === 'object' && String(it.subject || '').toLowerCase() === String(subjectKey || '').toLowerCase());
                if (picked.length) out.push(picked);
            } else if (!hasOtherOverlays) {
                out.push(json);
            }
        } else if (json && Array.isArray(json.items)) {
            const subj = json.subject ? String(json.subject).toLowerCase() : '';
            if (subj && subj === String(subjectKey || '').toLowerCase()) out.push(json.items);
            else if (!subj && !hasOtherOverlays) out.push(json.items);
        }
    } catch {}
    return out;
}

async function applyOverlaysForSubject(subjectKey) {
    const subjectLower = String(subjectKey || '').toLowerCase();
    // 本地 localStorage 覆盖层
    const localSets = getLocalOverlays(subjectKey);
    localSets.forEach(arr => {
        const v = validateOverlayItems(arr, subjectKey);
        const safe = (v.items || []).filter(it => !(it && it._unknown));
        if (safe.length) mergeOverlayItems(subjectKey, safe);
    });

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
        const topSubject = (data && data.subject) ? String(data.subject).toLowerCase() : '';
        if (topSubject && topSubject !== subjectLower) continue;
        if (!topSubject) {
            if (Array.isArray(items) && items.some(it => it && typeof it === 'object' && it.subject)) {
                items = items.filter(it => it && typeof it === 'object' && String(it.subject || '').toLowerCase() === subjectLower);
                if (!items.length) continue;
            } else {
                const fname = String((f && f.name) ? f.name : '').toLowerCase();
                if (!fname || fname !== `subject_${subjectLower}.json`) continue;
            }
        }
        const v = validateOverlayItems(items, subjectKey);
        const safe = (v.items || []).filter(it => !(it && it._unknown));
        if (safe.length) mergeOverlayItems(subjectKey, safe);
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
        showToast('请至少选择一个选项', 'warn');
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
    const quick = document.getElementById('quickJumpOverlay');
    if (quick && quick.style.display !== 'none') return;
    const help = document.getElementById('helpOverlay');
    if (help && help.style.display !== 'none') return;
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

// ============== 主题切换 ==============
function setupThemeToggle() {
    const root = document.documentElement;
    const btn = document.getElementById('themeToggle');
    const saved = localStorage.getItem('theme');
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    let theme = saved || (mq.matches ? 'dark' : 'light');

    const apply = (t) => {
        if (t === 'dark') root.setAttribute('data-theme', 'dark');
        else root.setAttribute('data-theme', 'light');
        if (btn) btn.textContent = t === 'dark' ? '🌞 亮色' : '🌙 暗色';
    };
    apply(theme);

    // Listen for system theme changes (only when user hasn't manually set)
    mq.addEventListener('change', e => {
        if (!localStorage.getItem('theme')) {
            apply(e.matches ? 'dark' : 'light');
        }
    });

    if (btn) {
        btn.onclick = () => {
            theme = theme === 'dark' ? 'light' : 'dark';
            localStorage.setItem('theme', theme);
            apply(theme);
        };
    }
}

function setupStyleSelect() {
    const root = document.documentElement;
    const sel = document.getElementById('styleSelect');
    const saved = localStorage.getItem('style') || 'default';
    const apply = (style) => {
        if (style && style !== 'default') root.setAttribute('data-style', style);
        else root.removeAttribute('data-style');
    };
    apply(saved);
    if (sel) {
        sel.value = saved;
        sel.onchange = () => {
            const val = sel.value || 'default';
            localStorage.setItem('style', val);
            apply(val);
        };
    }
}

function setupLayoutSelect() {
    const root = document.documentElement;
    const sel = document.getElementById('layoutSelect');
    const savedRaw = localStorage.getItem('layout') || 'default';
    const normalize = (l) => (l === 'magazine' ? 'default' : l);
    const saved = normalize(savedRaw);
    const apply = (layout) => {
        const v = normalize(layout || 'default');
        if (v && v !== 'default') root.setAttribute('data-layout', v);
        else root.removeAttribute('data-layout');
    };
    apply(saved);
    if (sel) {
        sel.value = saved;
        sel.onchange = () => {
            const val = normalize(sel.value || 'default');
            localStorage.setItem('layout', val);
            apply(val);
        };
    }
}

function setupDensitySelect() {
    const root = document.documentElement;
    const sel = document.getElementById('densitySelect');
    const saved = localStorage.getItem('density') || 'default';
    const apply = (density) => {
        if (density && density !== 'default') root.setAttribute('data-density', density);
        else root.removeAttribute('data-density');
    };
    apply(saved);
    if (sel) {
        sel.value = saved;
        sel.onchange = () => {
            const val = sel.value || 'default';
            localStorage.setItem('density', val);
            apply(val);
        };
    }
}

function setupStickyHeader() {
    const header = document.querySelector('.header');
    if (!header) return;
    let lastY = 0;
    let ticking = false;
    let shrunk = false;
    let hidden = false;
    const apply = (y) => {
        // Hysteresis to avoid jitter: expand <20px, shrink >80px
        if (!shrunk && y > 80) { header.classList.add('header-shrink'); shrunk = true; }
        else if (shrunk && y < 20) { header.classList.remove('header-shrink'); shrunk = false; }
        // Auto-hide on scroll down, show on scroll up
        const dy = y - (header._lastAppliedY || 0);
        header._lastAppliedY = y;
        if (y > 100 && dy > 2 && !hidden) { header.classList.add('header-hidden'); hidden = true; }
        else if ((dy < -2 || y < 60) && hidden) { header.classList.remove('header-hidden'); hidden = false; }
    };
    const onScroll = () => {
        lastY = window.scrollY || document.documentElement.scrollTop || 0;
        if (!ticking) {
            window.requestAnimationFrame(() => { apply(lastY); ticking = false; });
            ticking = true;
        }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
}

// 初始化应用
function initApp() {
    ensureCurrentSubjectAvailable();
    setupThemeToggle();
    setupStyleSelect();
    setupLayoutSelect();
    setupDensitySelect();
    setupStickyHeader();
    setupNavToggle();
    setupQuickJumpPanel();
    setupHelpOverlay();
    bindCspSafeEvents();
    // 合并所有题目
    allQuestions = SUBJECTS[currentSubject].getQuestions();
    originalQuestions = [...allQuestions];
    updateSubjectButtons();
    setupAutoAdvanceToggle();
    loadProgress();
    updateStats();
    discoverSubjectsFromServer().catch(() => {});
    const proceed = () => {
        renderQuestionNav();
        const params = new URLSearchParams(window.location.search);
        if (params.has('reviewWrong')) {
            reviewWrongQuestions();
        } else {
            showQuestion();
        }
        updateSubjectStatus();
        setupFeatureTips();
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

    // 触发题目内容滑入动画
    const container = document.getElementById('questionContainer');
    if (container) {
        container.classList.remove('active');
        void container.offsetWidth;
        container.classList.add('active');
    }
    
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
    const mainBtn = document.getElementById('showAnswerBtn');
    if (mainBtn) mainBtn.textContent = '显示答案';
    const mbBtn = document.getElementById('mbShowBtn');
    if (mbBtn) mbBtn.textContent = '显示答案';
    
    // 更新按钮状态
    document.getElementById('prevBtn').disabled = currentIndex === 0;
    document.getElementById('nextBtn').disabled = currentIndex === allQuestions.length - 1;
    const mbPrev = document.getElementById('mbPrevBtn'); if (mbPrev) mbPrev.disabled = currentIndex === 0;
    const mbNext = document.getElementById('mbNextBtn'); if (mbNext) mbNext.disabled = currentIndex === allQuestions.length - 1;
    
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
            if (!userAnswer) { showToast('请输入答案', 'warn'); return; }
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
        answeredQuestions.add(currentIndex);
        correctAnswers++;
        wrongQuestions.delete(question.id);
        saveProgress();
        updateStats();
        highlightSingleJudgeOptions(question, answer);
        if (autoAdvance) {
            setTimeout(() => {
                if (currentIndex < allQuestions.length - 1) {
                    currentIndex++;
                    showQuestion();
                }
            }, 800);
        }
    } else {
        answeredQuestions.add(currentIndex);
        wrongQuestions.set(question.id, {
            question: question,
            userAnswer: answer,
            timestamp: new Date().toLocaleString()
        });
        saveProgress();
        updateStats();
        highlightSingleJudgeOptions(question, answer);
        showAnswer();
    }
}

// 提交填空题答案
function submitFillAnswer(userAnswer, question) {
    // 标准化答案的函数：转小写，移除所有空格和中英文标点
    const normalize = (str) => {
        return str.toLowerCase()
                  .replace(/\s+/g, '') // 移除空格
                  .replace(/[.,?!;:'”，。！？；：'”()_\/\-【】\[\]]/g, ''); // 移除中英文标点、括号、下划线等
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
        
        // 输入框反馈
        const fillInput = document.querySelector('.fill-input');
        if (fillInput) { fillInput.style.borderColor = '#22c55e'; fillInput.style.background = '#f0fdf4'; }

        // 1.2秒后自动跳到下一题
        setTimeout(() => {
            if (currentIndex < allQuestions.length - 1) {
                currentIndex++;
                showQuestion();
            }
        }, 800);
    } else {
        // 答错了
        const fillInput = document.querySelector('.fill-input');
        if (fillInput) { fillInput.style.borderColor = '#ef4444'; fillInput.style.background = '#fef2f2'; }
        answeredQuestions.add(currentIndex);
        // 记录到错题集
        wrongQuestions.set(question.id, {
            question: question,
            userAnswer: userAnswer,
            timestamp: new Date().toLocaleString()
        });
        saveProgress();
        updateStats();
        
        // 显示答案
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
    const mainBtn = document.getElementById('showAnswerBtn');
    if (mainBtn) mainBtn.textContent = '✓ 已显示';
    const mbBtn = document.getElementById('mbShowBtn');
    if (mbBtn) mbBtn.textContent = '✓ 已显示';
}

// 反馈已改为纯选项高亮，不再弹出任何消息
function showCorrectMessage() {}
function showWrongMessage() {}

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

// 随机跳转一题
function goRandomQuestion() {
    if (!allQuestions || allQuestions.length === 0) return;
    const idx = Math.floor(Math.random() * allQuestions.length);
    currentIndex = idx;
    if (currentMode !== 'practice') switchMode('practice');
    showQuestion();
}

// 跳转到指定题号
function jumpToQuestion() {
    const input = document.getElementById('jumpInput');
    if (!input) return;
    const val = parseInt(input.value, 10);
    if (isNaN(val)) { showToast('请输入有效的题号', 'warn'); return; }
    if (val < 1 || val > allQuestions.length) { showToast(`题号超出范围 1-${allQuestions.length}`, 'warn'); return; }
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
                optionsHtml += `<div style="${style}">  ${letter}、${escapeHTML(option)}</div>`;
            });
            optionsHtml += '</div>';
        }
        
        // 构建答案显示
        let answerHtml = `
            <div style="margin-top: 10px; padding: 10px; background: #e8f5e9; border-left: 4px solid #4CAF50; border-radius: 4px;">
                <div style="color: #2e7d32; font-weight: bold; margin-bottom: 5px;">✓ 答案：${escapeHTML(question.answer)}</div>
                <div style="color: #555; font-size: 0.9em;">${escapeHTML(question.answerText)}</div>
            </div>
        `;
        
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.justifyContent = 'space-between';
        wrapper.style.alignItems = 'flex-start';
        const left = document.createElement('div');
        left.style.flex = '1';
        left.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                <strong style="color: #667eea;">第 ${questionIndex + 1} 题</strong>
                <span style="background: #667eea; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75em;">${getTypeLabel(question.type)}</span>
            </div>
            <p style="margin: 8px 0; font-size: 0.95em; color: #333; line-height: 1.5;">${escapeHTML(question.question)}</p>
            ${optionsHtml}
            ${answerHtml}
        `;
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary';
        btn.style.minWidth = '80px';
        btn.style.padding = '8px 12px';
        btn.style.fontSize = '0.9em';
        btn.style.marginLeft = '10px';
        btn.style.whiteSpace = 'nowrap';
        btn.textContent = '练习';
        btn.addEventListener('click', (e) => { e.stopPropagation(); goToPracticMode(questionIndex); });
        wrapper.appendChild(left);
        wrapper.appendChild(btn);
        div.innerHTML = '';
        div.appendChild(wrapper);
        
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
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function renderQuestionNav() {
    const nav = document.getElementById('questionNavList');
    if (!nav) return;
    nav.innerHTML = '';

    // 预计算每个题型的第一题索引，供题型标签跳转
    const firstOfType = {};
    allQuestions.forEach((q, idx) => {
        if (!(q.type in firstOfType)) firstOfType[q.type] = idx;
    });

    allQuestions.forEach((q, idx) => {
        const item = document.createElement('div');
        item.className = 'nav-item' + (idx === currentIndex ? ' active' : '');
        item.setAttribute('data-index', idx);
        const tag = getTypeLabel(q.type);
        const firstIdx = firstOfType[q.type];
        item.innerHTML = '<span class="nav-num">' + (idx + 1) + '</span><span class="nav-tag" data-jump-type="' + q.type + '" title="跳转到第一道' + tag + '（第' + (firstIdx + 1) + '题）">' + tag + '</span><span class="nav-title">' + escapeHtml(q.question.slice(0, 28)) + '</span>';
        nav.appendChild(item);
    });

    nav.onclick = (e) => {
        // 点击题型标签 → 跳到该题型第一题
        const tagEl = e.target.closest('.nav-tag');
        if (tagEl) {
            const type = tagEl.getAttribute('data-jump-type');
            if (type && type in firstOfType) {
                currentIndex = firstOfType[type];
                showQuestion();
            }
            return;
        }
        // 点击题目行 → 跳到该题
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
        showToast('当前科目进度已重置', 'success');
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
        showToast('已清空所有数据', 'success');
    }
}

// 切换科目
function switchSubject(subjectKey) {
    if (!SUBJECTS[subjectKey]) { showToast('未知科目', 'error'); return; }
    currentSubject = subjectKey;
    localStorage.setItem('currentSubject', subjectKey);

    setLoading(true, '正在切换科目...');

    // 重新加载题目与覆盖层
    allQuestions = SUBJECTS[currentSubject].getQuestions();
    originalQuestions = [...allQuestions];
    const after = () => {
        loadProgress();
        updateStats();
        showQuestion();
        updateSubjectButtons();
        renderQuestionNav();
        setLoading(false);
        showToast(`已切换科目：${SUBJECTS[subjectKey].name}`,'success');
    };
    applyOverlaysForSubject(subjectKey).then(after).catch(after);
}

// 更新科目按钮样式
function updateSubjectButtons() {
    const container = document.querySelector('.subject-btn-group');
    if (container) {
        container.querySelectorAll('[data-subject-dynamic="1"]').forEach(el => el.remove());
        Object.keys(SUBJECTS).forEach(key => {
            if (DEFAULT_SUBJECT_KEYS.has(key)) return;
            const exists = container.querySelector(`[data-subject-btn][data-subject="${key}"]`);
            if (exists) return;
            const btn = document.createElement('button');
            btn.className = 'subject-btn';
            btn.setAttribute('data-subject-btn', '');
            btn.setAttribute('data-subject', key);
            btn.setAttribute('data-subject-dynamic', '1');
            btn.textContent = SUBJECTS[key].name;
            btn.onclick = () => switchSubject(key);
            container.appendChild(btn);
        });
    }
    document.querySelectorAll('[data-subject-btn]').forEach(btn => {
        const key = btn.getAttribute('data-subject');
        if (key === currentSubject) btn.classList.add('active'); else btn.classList.remove('active');
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
                optionsHtml += `<div style="${style}">  ${letter}、${escapeHTML(option)}</div>`;
            });
            optionsHtml += '</div>';
        }
        
        // 构建答案显示
        let answerHtml = `
            <div style="margin-top: 12px; padding: 12px; background: #e8f5e9; border-left: 4px solid #4CAF50; border-radius: 4px;">
                <div style="color: #2e7d32; font-weight: bold; margin-bottom: 5px;">✓ 正确答案：${escapeHTML(question.answer)}</div>
                <div style="color: #555; font-size: 0.95em;">${escapeHTML(question.answerText)}</div>
            </div>
        `;
        
        // 用户答案显示
        let userAnswerHtml = '';
        if (wrongData.userAnswer) {
            userAnswerHtml = `
                <div style="margin-top: 12px; padding: 12px; background: #ffebee; border-left: 4px solid #f44336; border-radius: 4px;">
                    <div style="color: #c62828; font-weight: bold; margin-bottom: 5px;">✗ 你的答案：${escapeHTML(wrongData.userAnswer)}</div>
                </div>
            `;
        }
        
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'flex-start';
        const left = document.createElement('div');
        left.style.flex = '1';
        left.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                <strong style="color: #667eea; font-size: 1.1rem;">第 ${question.id} 题</strong>
                <span style="background: #667eea; color: white; padding: 3px 10px; border-radius: 12px; font-size: 0.85em;">${getTypeLabel(question.type)}</span>
            </div>
            <p style="margin: 10px 0; font-size: 1.05rem; color: #333; line-height: 1.6;">${escapeHTML(question.question)}</p>
            ${optionsHtml}
            ${userAnswerHtml}
            ${answerHtml}
        `;
        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '8px';
        actions.style.marginLeft = '10px';
        const again = document.createElement('button');
        again.className = 'btn btn-primary';
        again.style.minWidth = '80px';
        again.style.padding = '10px 16px';
        again.style.fontSize = '0.95rem';
        again.style.whiteSpace = 'nowrap';
        again.textContent = '再练一遍';
        again.addEventListener('click', () => reviewQuestion(question.id));
        const remove = document.createElement('button');
        remove.className = 'btn btn-secondary';
        remove.style.minWidth = '80px';
        remove.style.padding = '10px 16px';
        remove.style.fontSize = '0.95rem';
        remove.style.whiteSpace = 'nowrap';
        remove.textContent = '移除';
        remove.addEventListener('click', () => { removeFromWrong(question.id); renderWrongList(); });
        actions.appendChild(again);
        actions.appendChild(remove);
        row.appendChild(left);
        row.appendChild(actions);
        div.innerHTML = '';
        div.appendChild(row);
        
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
    if (wrongQuestions.size === 0) { showToast('没有错题，继续加油！', 'info'); return; }
    
    // 创建错题列表
    const wrongIds = Array.from(wrongQuestions.keys());
    const wrongQuestionsArray = originalQuestions.filter(q => wrongIds.includes(q.id));
    if (wrongQuestionsArray.length === 0) { showToast('没有找到对应的错题', 'warn'); return; }
    
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
        showToast(`开始复习 ${wrongQuestionsArray.length} 道错题`, 'info');
    }, 100);
}

// 清空错题集
function clearWrongQuestions() {
    if (confirm('确定要清空错题集吗？')) {
        wrongQuestions.clear();
        saveProgress();
        renderWrongList();
        showToast('已清空错题集', 'success');
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
                optionsHtml += `<div style="${style}">  ${letter}、${escapeHTML(option)}</div>`;
            });
            optionsHtml += '</div>';
        }
        
        // 构建答案显示
        let answerHtml = `
            <div style="margin-top: 12px; padding: 12px; background: #e8f5e9; border-left: 4px solid #4CAF50; border-radius: 4px;">
                <div style="color: #2e7d32; font-weight: bold; margin-bottom: 5px;">✓ 答案：${escapeHTML(question.answer)}</div>
                <div style="color: #555; font-size: 0.95em;">${escapeHTML(question.answerText)}</div>
            </div>
        `;
        
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'flex-start';
        const left = document.createElement('div');
        left.style.flex = '1';
        left.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                <strong style="color: #667eea; font-size: 1.1rem;">第 ${question.id} 题</strong>
                <span style="background: #667eea; color: white; padding: 3px 10px; border-radius: 12px; font-size: 0.85em;">${getTypeLabel(question.type)}</span>
                <span style="color: #999; font-size: 0.85em;">收藏于 ${collectedData.timestamp}</span>
            </div>
            <p style="margin: 10px 0; font-size: 1.05rem; color: #333; line-height: 1.6;">${escapeHTML(question.question)}</p>
            ${optionsHtml}
            ${answerHtml}
        `;
        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.gap = '8px';
        actions.style.marginLeft = '10px';
        const practice = document.createElement('button');
        practice.className = 'btn btn-primary';
        practice.style.minWidth = '80px';
        practice.style.padding = '10px 16px';
        practice.style.fontSize = '0.95rem';
        practice.style.whiteSpace = 'nowrap';
        practice.textContent = '练习';
        practice.addEventListener('click', () => goToPracticMode(question.id - 1));
        const cancel = document.createElement('button');
        cancel.className = 'btn btn-secondary';
        cancel.style.minWidth = '80px';
        cancel.style.padding = '10px 16px';
        cancel.style.fontSize = '0.95rem';
        cancel.style.whiteSpace = 'nowrap';
        cancel.textContent = '取消';
        cancel.addEventListener('click', () => { toggleCollectQuestion(question.id); renderCollectedList(); });
        actions.appendChild(practice);
        actions.appendChild(cancel);
        row.appendChild(left);
        row.appendChild(actions);
        div.innerHTML = '';
        div.appendChild(row);
        
        list.appendChild(div);
    });
}

// 清空收藏
function clearCollectedQuestions() {
    if (confirm('确定要清空所有收藏吗？')) {
        collectedQuestions.clear();
        saveProgress();
        renderCollectedList();
        showToast('已清空收藏', 'success');
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
    showToast('已退出复习模式，返回完整题库。','info');
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initApp);
document.addEventListener('keydown', handleKeydown);
