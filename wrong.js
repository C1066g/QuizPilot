(function(){
  const $ = (id) => document.getElementById(id);
  const escapeHTML = (s) => String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  const SUBJECTS = {
    ai: {
      name: '人工智能',
      getQuestions: () => (typeof questionsPart1 !== 'undefined' ? [...questionsPart1, ...questionsPart2, ...questionsPart3, ...questionsPart4] : [])
    },
    exchange: {
      name: '现代交换原理',
      getQuestions: () => (typeof questionsExchange !== 'undefined' ? questionsExchange : [])
    },
    linux: {
      name: 'Linux 技术应用',
      getQuestions: () => (typeof questionsLinux !== 'undefined' ? questionsLinux : [])
    }
  };

  let allQuestions = [];
  let wrongQuestions = new Map();
  const currentSubject = localStorage.getItem('currentSubject') || 'ai';

  function getProgressKey(){ return `quizProgress_${currentSubject}`; }

  function loadWrongQuestions(){
    try {
      const saved = localStorage.getItem(getProgressKey());
      if (saved) {
        const progress = JSON.parse(saved);
        wrongQuestions = new Map(progress.wrongQuestions || []);
      }
    } catch {}
  }

  function saveWrongQuestions(){
    try {
      const saved = localStorage.getItem(getProgressKey());
      const progress = saved ? JSON.parse(saved) : {};
      progress.wrongQuestions = Array.from(wrongQuestions.entries());
      localStorage.setItem(getProgressKey(), JSON.stringify(progress));
    } catch {}
  }

  const getTypeLabel = (type) => ({
    single:'单选题', multiple:'多选题', fill:'填空题', judge:'判断题', essay:'简答题'
  })[type] || type;

  function renderWrongList(){
    const list = $('wrongList'); if (!list) return;
    const count = $('wrongCount'); const total = $('totalCount');
    if (count) count.textContent = wrongQuestions.size;
    if (total) total.textContent = allQuestions.length;

    list.innerHTML = '';
    if (wrongQuestions.size === 0) {
      list.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎉</div><p>太棒了！没有错题，继续加油！</p></div>';
      return;
    }

    wrongQuestions.forEach((wrongData, questionId) => {
      const question = wrongData.question;
      const div = document.createElement('div');
      div.className = 'question-item';

      const header = document.createElement('div'); header.className = 'question-header';
      const num = document.createElement('span'); num.className = 'question-number'; num.textContent = `第 ${question.id} 题`;
      const typ = document.createElement('span'); typ.className = 'question-type'; typ.textContent = getTypeLabel(question.type);
      header.appendChild(num); header.appendChild(typ);

      const qtext = document.createElement('div'); qtext.className = 'question-text'; qtext.textContent = String(question.question||'');

      let optionsWrap = null;
      if (question.type === 'single' || question.type === 'multiple') {
        optionsWrap = document.createElement('div'); optionsWrap.className = 'options';
        (question.options||[]).forEach((opt, idx) => {
          const letter = String.fromCharCode(65+idx);
          const el = document.createElement('div');
          let cls = 'option';
          if (letter === question.answer) cls += ' correct';
          if (letter === wrongData.userAnswer) cls += ' wrong';
          el.className = cls;
          el.textContent = `${letter}、${String(opt||'')}`;
          optionsWrap.appendChild(el);
        });
      }

      const answerBox = document.createElement('div'); answerBox.className = 'answer-box';
      const ansLbl = document.createElement('div'); ansLbl.className = 'answer-label'; ansLbl.textContent = `✓ 正确答案：${String(question.answer||'')}`;
      const ansTxt = document.createElement('div'); ansTxt.className = 'answer-text'; ansTxt.textContent = String(question.answerText||'');
      answerBox.appendChild(ansLbl); answerBox.appendChild(ansTxt);

      const btns = document.createElement('div'); btns.className = 'button-group';
      const again = document.createElement('button'); again.className='btn btn-primary'; again.textContent='再练一遍';
      again.addEventListener('click', () => { window.location.href = `index.html?question=${question.id}`; });
      const remove = document.createElement('button'); remove.className='btn btn-secondary'; remove.textContent='移除';
      remove.addEventListener('click', () => { wrongQuestions.delete(question.id); saveWrongQuestions(); renderWrongList(); });
      btns.appendChild(again); btns.appendChild(remove);

      div.appendChild(header);
      div.appendChild(qtext);
      if (optionsWrap) div.appendChild(optionsWrap);
      div.appendChild(answerBox);
      div.appendChild(btns);
      list.appendChild(div);
    });
  }

  function bindPageActions(){
    const reviewAll = $('reviewAllWrongBtn'); if (reviewAll) reviewAll.addEventListener('click', () => {
      if (wrongQuestions.size === 0) { alert('没有错题，继续加油！'); return; }
      window.location.href = 'index.html?reviewWrong=true';
    });
    const clearAll = $('clearAllWrongBtn'); if (clearAll) clearAll.addEventListener('click', () => {
      if (confirm('确定要清空所有错题吗？')) {
        wrongQuestions.clear(); saveWrongQuestions(); renderWrongList(); alert('已清空错题集');
      }
    });
  }

  function init(){
    allQuestions = (SUBJECTS[currentSubject] && SUBJECTS[currentSubject].getQuestions()) || [];
    loadWrongQuestions();
    bindPageActions();
    renderWrongList();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
