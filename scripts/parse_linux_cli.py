import argparse
import json
import re
import sys
from pathlib import Path


def is_question_start(s: str):
    return re.match(r'^(\d+)[、\.]', s.strip())


def parse_content(raw: str):
    lines = [ln.rstrip() for ln in raw.splitlines()]
    questions = []

    idx = 0
    while idx < len(lines):
        line = lines[idx].strip()
        m = is_question_start(line)
        if not m:
            idx += 1
            continue
        qid = int(m.group(1))
        # 默认用中文顿号分割，若无则尝试点号
        if '、' in line:
            qtext = line.split('、', 1)[1].strip()
        elif '.' in line:
            qtext = line.split('.', 1)[1].strip()
        else:
            qtext = line
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

    return questions


def main():
    parser = argparse.ArgumentParser(description='Parse linux question bank text into questions-linux.js')
    repo_root = Path(__file__).resolve().parent.parent
    parser.add_argument('-i', '--input', default=str(repo_root / 'linux_raw_full.txt'),
                        help='Path to input text file (default: linux_raw_full.txt in repo root)')
    parser.add_argument('-o', '--output', default=str(repo_root / 'rgzr' / 'questions-linux.js'),
                        help='Path to output questions js (default: rgzr/questions-linux.js)')
    parser.add_argument('-e', '--encoding', default='utf-8', help='File encoding for input/output (default: utf-8)')
    args = parser.parse_args()

    in_path = Path(args.input)
    out_path = Path(args.output)

    try:
        raw = in_path.read_text(encoding=args.encoding)
    except FileNotFoundError:
        print(f'Input file not found: {in_path}', file=sys.stderr)
        sys.exit(1)
    except Exception as ex:
        print(f'Failed to read input: {ex}', file=sys.stderr)
        sys.exit(1)

    questions = parse_content(raw)

    js = 'const questionsLinux = ' + json.dumps(questions, ensure_ascii=False, indent=4) + ';\n'
    try:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(js, encoding=args.encoding)
    except Exception as ex:
        print(f'Failed to write output: {ex}', file=sys.stderr)
        sys.exit(2)

    print('written', out_path, 'count', len(questions))


if __name__ == '__main__':
    main()
