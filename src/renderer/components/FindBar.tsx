import { useEffect, useState } from 'react';
import { ChevronUp, ChevronDown, X, Search } from 'lucide-react';
import { command, useBrowser } from '../stores/browser';
import { IconButton } from './common';
export function FindBar() {
  const { state, set } = useBrowser();
  const [text, setText] = useState('');
  useEffect(() => {
    void command({ type: 'find', text });
  }, [text, state?.activeId]);
  const close = () => {
    set({ find: false });
    void command({ type: 'find', text: '' });
  };
  return (
    <div className="find-bar">
      <Search size={15} />
      <input
        autoFocus
        aria-label="Find in page"
        placeholder="Find in page"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter')
            void command({ type: 'find', text, next: true, forward: !e.shiftKey });
          if (e.key === 'Escape') close();
        }}
      />
      <span aria-live="polite">
        {state?.find.active ?? 0} / {state?.find.matches ?? 0}
      </span>
      <IconButton
        icon={ChevronUp}
        label="Previous match"
        disabled={!text}
        onClick={() => void command({ type: 'find', text, next: true, forward: false })}
      />
      <IconButton
        icon={ChevronDown}
        label="Next match"
        disabled={!text}
        onClick={() => void command({ type: 'find', text, next: true })}
      />
      <IconButton icon={X} label="Close find" onClick={close} />
    </div>
  );
}
