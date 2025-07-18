import { Node, mergeAttributes } from '@tiptap/core';

export interface PanelOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    panel: {
      setPanel: (type: 'info' | 'warning' | 'error' | 'success') => ReturnType;
    };
  }
}

export const PanelExtension = Node.create<PanelOptions>({
  name: 'panel',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  group: 'block',

  content: 'block+',

  defining: true,

  addAttributes() {
    return {
      type: {
        default: 'info',
        parseHTML: element => element.getAttribute('data-panel-type'),
        renderHTML: attributes => ({
          'data-panel-type': attributes.type,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-panel]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const panelType = HTMLAttributes['data-panel-type'] || 'info';
    return [
      'div',
      mergeAttributes(
        {
          'data-panel': 'true',
          class: `panel panel-${panelType}`,
        },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      [
        'div',
        { class: 'panel-header' },
        panelType.charAt(0).toUpperCase() + panelType.slice(1),
      ],
      ['div', { class: 'panel-body' }, 0],
    ];
  },

  addCommands() {
    return {
      setPanel:
        (type: 'info' | 'warning' | 'error' | 'success') =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { type },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Panel content...' }] }],
          });
        },
    };
  },
});