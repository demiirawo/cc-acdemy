import { Node, mergeAttributes } from '@tiptap/core';

export interface CommentOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      addComment: (commentId: string, text: string, author: string) => ReturnType;
      removeComment: (commentId: string) => ReturnType;
    };
  }
}

export const CommentExtension = Node.create<CommentOptions>({
  name: 'comment',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  group: 'inline',

  inline: true,

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: element => element.getAttribute('data-comment-id'),
        renderHTML: attributes => ({
          'data-comment-id': attributes.commentId,
        }),
      },
      text: {
        default: '',
        parseHTML: element => element.getAttribute('data-comment-text'),
        renderHTML: attributes => ({
          'data-comment-text': attributes.text,
        }),
      },
      author: {
        default: '',
        parseHTML: element => element.getAttribute('data-comment-author'),
        renderHTML: attributes => ({
          'data-comment-author': attributes.author,
        }),
      },
      resolved: {
        default: false,
        parseHTML: element => element.getAttribute('data-comment-resolved') === 'true',
        renderHTML: attributes => ({
          'data-comment-resolved': attributes.resolved,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-comment]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { commentId, text, author, resolved } = HTMLAttributes;
    
    return [
      'span',
      mergeAttributes(
        {
          'data-comment': 'true',
          class: `comment-marker ${resolved ? 'comment-resolved' : 'comment-active'}`,
          title: `${author}: ${text}`,
        },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      [
        'span',
        { class: 'comment-indicator' },
        '💬',
      ],
    ];
  },

  addCommands() {
    return {
      addComment:
        (commentId: string, text: string, author: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { commentId, text, author, resolved: false },
          });
        },
      removeComment:
        (commentId: string) =>
        ({ chain, state }) => {
          const { doc } = state;
          let commentFound = false;
          
          doc.descendants((node, pos) => {
            if (node.type.name === this.name && node.attrs.commentId === commentId) {
              chain().deleteRange({ from: pos, to: pos + node.nodeSize });
              commentFound = true;
              return false;
            }
          });
          
          return commentFound;
        },
    };
  },
});