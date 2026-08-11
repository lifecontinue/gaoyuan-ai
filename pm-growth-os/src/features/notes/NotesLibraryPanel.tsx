import { useState } from 'react';
import { SectionCard } from '../../components/ui/SectionCard';
import { notify } from '../../lib/notifications';
import { useAppStore } from '../../store/app-store';
import type { Note } from '../../types/domain';

export function NotesLibraryPanel() {
  const capabilities = useAppStore((state) => state.capabilities);
  const deleteNote = useAppStore((state) => state.deleteNote);
  const exportNotesMarkdown = useAppStore((state) => state.exportNotesMarkdown);
  const notes = useAppStore((state) => state.notes);
  const sendNoteToCapture = useAppStore((state) => state.sendNoteToCapture);
  const [query, setQuery] = useState('');
  const [capabilityFilter, setCapabilityFilter] = useState('all');
  const capabilityNameById = new Map(
    capabilities.map((capability) => [capability.id, capability.name]),
  );
  const filteredNotes = notes.filter(
    (note) =>
      matchesQuery(note, query) &&
      (capabilityFilter === 'all' || note.relatedCapabilityIds.includes(capabilityFilter)),
  );

  return (
    <SectionCard
      title="Evidence Library"
      subtitle="Search and reuse"
      actionLabel="Export Markdown"
      actionDisabled={notes.length === 0}
      onAction={() => downloadMarkdown(exportNotesMarkdown())}
    >
      <div className="stack-sm">
        <div className="library-controls">
          <input
            className="library-input"
            value={query}
            placeholder="Search content, tags, or capabilities"
            onChange={(event) => setQuery(event.target.value)}
          />
          <select
            className="library-select"
            value={capabilityFilter}
            onChange={(event) => setCapabilityFilter(event.target.value)}
          >
            <option value="all">All capabilities</option>
            {capabilities.map((capability) => (
              <option key={capability.id} value={capability.id}>
                {capability.name}
              </option>
            ))}
          </select>
        </div>
        <div className="section-inline-header">
          <strong>Search Results</strong>
          <span className="muted-text">
            {filteredNotes.length}/{notes.length} evidence records
          </span>
        </div>
        {filteredNotes.length > 0 ? (
          <div className="library-list">
            {filteredNotes.map((note) => (
              <article className="library-note" key={note.id}>
                <div className="section-inline-header">
                  <strong>{new Date(note.createdAt).toLocaleString('en-US')}</strong>
                  <span className="muted-text">{note.tags.length} tags</span>
                </div>
                <p>{note.content}</p>
                <div className="tag-row">
                  {note.relatedCapabilityIds.map((id) => (
                    <span className="chip" key={id}>
                      {capabilityNameById.get(id) ?? id}
                    </span>
                  ))}
                  {note.tags.map((tag) => (
                    <span className="chip chip-muted" key={tag}>
                      #{tag}
                    </span>
                  ))}
                </div>
                <div className="library-actions">
                  <button className="text-button" onClick={() => sendNoteToCapture(note.id)}>
                    Use as Evidence Draft
                  </button>
                  <button className="text-button danger-text" onClick={() => deleteNote(note.id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted-text">
            No matching evidence yet. Save evidence and it will appear here.
          </p>
        )}
      </div>
    </SectionCard>
  );
}

function matchesQuery(note: Note, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return [note.content, ...note.tags, ...note.relatedCapabilityIds]
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery);
}

function downloadMarkdown(markdown: string) {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `pm-growth-evidence-${new Date().toISOString().slice(0, 10)}.md`;
  link.click();
  URL.revokeObjectURL(url);
  notify('Evidence exported as Markdown.', 'success');
}
