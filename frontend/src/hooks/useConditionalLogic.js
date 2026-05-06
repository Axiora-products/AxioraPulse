import { useMemo } from 'react';

export function useConditionalLogic(questions = [], answers = {}) {

  function evaluate(rule, answers) {
    if (!rule?.show_if) return true;
    const { question_id, operator, value } = rule.show_if;
    const ans = answers[question_id];
    if (ans === undefined || ans === null || ans === '') return false;
    const normalize = v => String(v ?? '').toLowerCase().trim();
    const ansStr    = normalize(ans);
    const valStr    = normalize(value);
    switch (operator) {
      case 'equals':       return ansStr === valStr;
      case 'not_equals':   return ansStr !== valStr;
      case 'contains':     return ansStr.includes(valStr);
      case 'not_contains': return !ansStr.includes(valStr);
      case 'includes':
        if (Array.isArray(ans)) return ans.map(normalize).includes(valStr);
        return ansStr.includes(valStr);
      case 'not_includes':
        if (Array.isArray(ans)) return !ans.map(normalize).includes(valStr);
        return !ansStr.includes(valStr);
      case 'gte':          return Number(ans) >= Number(value);
      case 'lte':          return Number(ans) <= Number(value);
      case 'first_is':
        if (Array.isArray(ans)) return normalize(ans[0]) === valStr;
        return false;
      default: return true;
    }
  }

  // PERF FIX: buildVisibility() was called on every render with no memoization.
  // On surveys with many questions and fast-typing users, this caused expensive
  // re-evaluations of all conditional rules on every keystroke.
  // Now memoized on [questions, answers] — only recomputes when they change.
  const visibility = useMemo(() => {
    const map = {};
    for (const q of questions) {
      const key = q._id || q.id;
      map[key]  = evaluate(q.conditional_logic, answers);
    }
    return map;
  }, [questions, answers]);

  const visibleQuestions = useMemo(
    () => questions.filter(q => visibility[q._id || q.id]),
    [questions, visibility]
  );

  function nextVisible(currentIndex) {
    for (let i = currentIndex + 1; i < questions.length; i++) {
      if (visibility[questions[i]._id || questions[i].id]) return i;
    }
    return null;
  }

  function prevVisible(currentIndex) {
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (visibility[questions[i]._id || questions[i].id]) return i;
    }
    return null;
  }

  function isVisible(questionId) {
    return visibility[questionId] !== false;
  }

  const visibleCount = visibleQuestions.length;

  function progressAt(currentIndex) {
    const visibleSoFar = questions
      .slice(0, currentIndex + 1)
      .filter(q => visibility[q._id || q.id]).length;
    return visibleCount ? Math.round((visibleSoFar / visibleCount) * 100) : 0;
  }

  return { visibility, visibleQuestions, visibleCount, isVisible, nextVisible, prevVisible, progressAt };
}

export function evaluateCondition(rule, answers) {
  if (!rule?.show_if) return true;
  const { question_id, operator, value } = rule.show_if;
  const ans = answers[question_id];
  if (ans === undefined || ans === null || ans === '') return false;
  const n = v => String(v ?? '').toLowerCase().trim();
  switch (operator) {
    case 'equals':       return n(ans) === n(value);
    case 'not_equals':   return n(ans) !== n(value);
    case 'contains':     return n(ans).includes(n(value));
    case 'not_contains': return !n(ans).includes(n(value));
    case 'includes':     return Array.isArray(ans) ? ans.map(n).includes(n(value)) : n(ans).includes(n(value));
    case 'not_includes': return Array.isArray(ans) ? !ans.map(n).includes(n(value)) : !n(ans).includes(n(value));
    case 'gte':          return Number(ans) >= Number(value);
    case 'lte':          return Number(ans) <= Number(value);
    case 'first_is':     return Array.isArray(ans) && n(ans[0]) === n(value);
    default:             return true;
  }
}
