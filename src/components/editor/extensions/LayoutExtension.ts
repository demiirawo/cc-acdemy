import { Node, mergeAttributes } from '@tiptap/core';

export interface LayoutOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    layout: {
      setLayout: (columns: number) => ReturnType;
      setLayoutColumn: () => ReturnType;
    };
  }
}

export const LayoutSection = Node.create<LayoutOptions>({
  name: 'layoutSection',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  group: 'block',

  content: 'layoutColumn+',

  defining: true,

  addAttributes() {
    return {
      columns: {
        default: 2,
        parseHTML: element => element.getAttribute('data-columns'),
        renderHTML: attributes => ({
          'data-columns': attributes.columns,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-layout="section"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(
        {
          'data-layout': 'section',
          class: 'layout-section',
        },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      0,
    ];
  },

  addCommands() {
    return {
      setLayout:
        (columns: number) =>
        ({ commands }) => {
          const columnNodes = Array.from({ length: columns }, () => ({
            type: 'layoutColumn',
            content: [{ type: 'paragraph' }],
          }));

          return commands.insertContent({
            type: this.name,
            attrs: { columns },
            content: columnNodes,
          });
        },
    };
  },
});

export const LayoutColumn = Node.create<LayoutOptions>({
  name: 'layoutColumn',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  content: 'block+',

  group: 'block',

  defining: true,

  parseHTML() {
    return [
      {
        tag: 'div[data-layout="column"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(
        {
          'data-layout': 'column',
          class: 'layout-column',
        },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      0,
    ];
  },

  addCommands() {
    return {
      setLayoutColumn:
        () =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            content: [{ type: 'paragraph' }],
          });
        },
    };
  },
});

export const LayoutExtension = [LayoutSection, LayoutColumn];