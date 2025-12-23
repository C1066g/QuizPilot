(function(){
  let allQuestions = [];
  let currentFilter = 'all';
  let currentSearchTerm = '';

  const $ = (id) => document.getElementById(id);
  const escapeHTML = (s) => String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  const getTypeLabel = (type) => ({
    single:'单选题', multiple:'多选题', fill:'填空题', judge:'判断题', essay:'简答题'
  })[type] || type;

  function getCollectedSet(){
    try { return new Set(JSON.parse(localStorage.getItem('collectedQuestions')||'[]')); } catch { return new Set(); }
  }
  function setCollectedSet(set){
    localStorage.setItem('collectedQuestions', JSON.stringify(Array.from(set)));
  }

  function renderQuestionList(){
    const list = $('questionList');
    if (!list) return;
    list.innerHTML = '';
    let filtered = allQuestions;
    if (currentFilter !== 'all') filtered = filtered.filter(q => q.type === currentFilter);
    if (currentSearchTerm) {
      const term = currentSearchTerm.toLowerCase();
      filtered = filtered.filter(q => (q.question||'').toLowerCase().includes(term) || (q.answerText||'').toLowerCase().includes(term));
    }
    const filteredCount = $('filteredCount'); if (filteredCount) filteredCount.textContent = filtered.length;
    if (filtered.length === 0) {
      list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><p>没有找到匹配的题目</p></div>';
      return;
    }
    const collected = getCollectedSet();
    filtered.forEach((question) => {
      const div = document.createElement('div');
      div.className = 'question-item';

      const header = document.createElement('div');
      header.className = 'question-header';
      const num = document.createElement('span'); num.className = 'question-number'; num.textContent = `第 ${question.id} 题`;
      const typ = document.createElement('span'); typ.className = 'question-type'; typ.textContent = getTypeLabel(question.type);
      header.appendChild(num); header.appendChild(typ);

      const qtext = document.createElement('div');
      qtext.className = 'question-text';
      qtext.textContent = String(question.question||'');

      let optionsWrap = null;
      if (question.type === 'single' || question.type === 'multiple') {
        optionsWrap = document.createElement('div'); optionsWrap.className = 'options';
        (question.options||[]).forEach((opt, idx) => {
          const letter = String.fromCharCode(65+idx);
          const el = document.createElement('div');
          el.className = (letter === question.answer) ? 'option correct' : 'option';
          el.textContent = `${letter}、${String(opt||'')}`;
          optionsWrap.appendChild(el);
        });
      }

      const answerBox = document.createElement('div');
      answerBox.className = 'answer-box';
      const ansLbl = document.createElement('div'); ansLbl.className = 'answer-label'; ansLbl.textContent = `✓ 答案：${String(question.answer||'')}`;
      const ansTxt = document.createElement('div'); ansTxt.className = 'answer-text'; ansTxt.textContent = String(question.answerText||'');
      answerBox.appendChild(ansLbl); answerBox.appendChild(ansTxt);

      const btnGroup = document.createElement('div'); btnGroup.className = 'button-group';
      const goBtn = document.createElement('button'); goBtn.className='btn btn-primary'; goBtn.textContent='进入练习';
      goBtn.addEventListener('click', () => {
        try { sessionStorage.setItem('browseFilter', currentFilter); sessionStorage.setItem('browseSearch', currentSearchTerm); } catch {}
        window.location.href = `index.html?question=${question.id}`;
      });
      const colBtn = document.createElement('button'); colBtn.className='btn btn-secondary';
      const updateColBtn = () => {
        if (collected.has(question.id)) {
          colBtn.textContent = '★ 已收藏'; colBtn.style.background = '#FFB800'; colBtn.style.color = 'white';
        } else {
          colBtn.textContent = '☆ 收藏'; colBtn.style.background = '#f0f0f0'; colBtn.style.color = '#333';
        }
      };
      updateColBtn();
      colBtn.addEventListener('click', () => {
        if (collected.has(question.id)) collected.delete(question.id); else collected.add(question.id);
        setCollectedSet(collected);
        updateColBtn();
      });
      btnGroup.appendChild(goBtn); btnGroup.appendChild(colBtn);

      div.appendChild(header);
      div.appendChild(qtext);
      if (optionsWrap) div.appendChild(optionsWrap);
      div.appendChild(answerBox);
      div.appendChild(btnGroup);
      list.appendChild(div);
    });
  }

  function bindEvents(){
    const search = $('searchInput'); if (search) search.addEventListener('input', () => { currentSearchTerm = search.value || ''; renderQuestionList(); });
    document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-filter') || 'all';
        currentFilter = type;
        document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderQuestionList();
      });
    });
  }

  function init(){
    if (typeof questionsPart1 === 'undefined') return;
    allQuestions = [...questionsPart1, ...questionsPart2, ...questionsPart3, ...questionsPart4];
    const totalCount = $('totalCount'); if (totalCount) totalCount.textContent = allQuestions.length;
    bindEvents();
    renderQuestionList();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
