import json, re, pathlib

raw_path = pathlib.Path(r'd:\桌面\qimofuxi\linux_raw_full.txt')
raw = raw_path.read_text(encoding='utf-8')

lines = [ln.rstrip() for ln in raw.splitlines()]
questions = []

def is_question_start(s: str):
    return re.match(r'^(\d+)[、\.]', s.strip())

idx = 0
while idx < len(lines):
    line = lines[idx].strip()
    m = is_question_start(line)
    if not m:
        idx += 1
        continue
    qid = int(m.group(1))
    qtext = line.split('、', 1)[1].strip()
    idx += 1
    options = []
    answer = ''

    # collect block
    while idx < len(lines):
        cur = lines[idx].strip()
        if is_question_start(cur):
            break
        if cur.startswith('答案'):
            answer = cur.split('答案：', 1)[-1].strip()
            idx += 1
            # consume following inline answer continuation lines until blank or next question/option
            while idx < len(lines):
                nxt = lines[idx].strip()
                if not nxt or is_question_start(nxt) or re.match(r'^[A-D]、', nxt) or nxt.startswith('答案'):
                    break
                # append to answer if likely continuation
                answer += ' ' + nxt
                idx += 1
            continue
        mopt = re.match(r'^([A-D])、\s*(.*)', cur)
        if mopt:
            options.append(mopt.group(2).strip())
            idx += 1
            continue
        # other text -> append to question
        qtext += ' ' + cur
        idx += 1

    ans_norm = answer.replace('。', '').strip()
    # determine type
    if options:
        qtype = 'single'
        answerText = ''
        if ans_norm and 'A' <= ans_norm[0].upper() <= 'D':
            pos = ord(ans_norm[0].upper()) - ord('A')
            if pos < len(options):
                answerText = options[pos]
        if not answerText:
            answerText = answer
    else:
        if ans_norm in ['正确', '错误', '对', '错']:
            qtype = 'judge'
        else:
            if '填空' in qtext or '____' in qtext or len(ans_norm) <= 15:
                qtype = 'fill'
            else:
                qtype = 'essay'
        answerText = answer

    questions.append({
        'id': qid,
        'type': qtype,
        'question': qtext,
        **({'options': options} if options else {}),
        'answer': ans_norm if ans_norm else answer,
        'answerText': answerText
    })

out_path = pathlib.Path(r'd:\桌面\qimofuxi\rgzr\questions-linux.js')
js = 'const questionsLinux = ' + json.dumps(questions, ensure_ascii=False, indent=4) + ';\n'
out_path.write_text(js, encoding='utf-8')
print('written', out_path, 'count', len(questions))
