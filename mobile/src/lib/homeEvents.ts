// 點左上角 Logo、或已經在首頁時再點一次首頁按鈕：首頁捲回最上面並重新整理
type Listener = () => void;
const listeners = new Set<Listener>();

export function onHomeTop(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitHomeTop() {
  listeners.forEach((l) => l());
}
