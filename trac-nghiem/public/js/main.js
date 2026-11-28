import { state, api, route, render, navigate } from './core.js';
import { landing, authPage, lobby, take, result } from './public.js';
import * as T from './teacher.js';

async function ensureUser() {
  if (state.user === undefined) {
    try { state.user = (await api('GET', '/api/auth/me', undefined, { noRedirect: true })).user; } catch (_) { state.user = null; }
  }
  return state.user;
}
const teacher = (fn) => async (...args) => {
  if (!(await ensureUser())) { navigate('/dang-nhap?next=' + encodeURIComponent(location.pathname), { replace: true }); return; }
  return fn(...args);
};
const pub = (fn) => async (...args) => { await ensureUser(); return fn(...args); };

route(/^\/$/, pub(landing));
route(/^\/dang-nhap\/?$/, pub(async () => ((await ensureUser()) ? navigate('/app', { replace: true }) : authPage('login'))));
route(/^\/dang-ky\/?$/, pub(async () => ((await ensureUser()) ? navigate('/app', { replace: true }) : authPage('register'))));
route(/^\/de\/([A-Za-z0-9]{4,8})\/?$/, pub(lobby));
route(/^\/lam-bai\/([a-f0-9]{20,64})\/?$/, take);
route(/^\/ket-qua\/([a-f0-9]{20,64})\/?$/, pub(result));
route(/^\/app\/?$/, teacher(T.dashboard));
route(/^\/app\/de\/?$/, teacher(T.examList));
route(/^\/app\/de\/moi\/?$/, teacher(T.createExam));
route(/^\/app\/de\/soan\/?$/, teacher(() => T.editor(null)));
route(/^\/app\/de\/([\w-]+)\/sua\/?$/, teacher((id) => T.editor(id)));
route(/^\/app\/de\/([\w-]+)\/in\/?$/, teacher(T.printExam));
route(/^\/app\/de\/([\w-]+)\/?$/, teacher((id) => T.examDetail(id)));
route(/^\/app\/bai\/([\w-]+)\/?$/, teacher(T.submissionDetail));
route(/^\/app\/lop\/?$/, teacher(T.classList));
route(/^\/app\/lop\/([\w-]+)\/?$/, teacher(T.classDetail));
route(/^\/app\/tai-khoan\/?$/, teacher(T.profile));

render();
