import { Node, mergeAttributes } from '@tiptap/core';

export interface SmartLinkOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    smartLink: {
      setSmartLink: (url: string, title?: string, preview?: boolean) => ReturnType;
    };
  }
}

export const SmartLinkExtension = Node.create<SmartLinkOptions>({
  name: 'smartLink',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  group: 'inline',

  inline: true,

  addAttributes() {
    return {
      href: {
        default: null,
        parseHTML: element => element.getAttribute('href'),
        renderHTML: attributes => ({
          href: attributes.href,
        }),
      },
      title: {
        default: null,
        parseHTML: element => element.getAttribute('data-title'),
        renderHTML: attributes => ({
          'data-title': attributes.title,
        }),
      },
      preview: {
        default: false,
        parseHTML: element => element.getAttribute('data-preview') === 'true',
        renderHTML: attributes => ({
          'data-preview': attributes.preview,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-smart-link]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { href, title, preview } = HTMLAttributes;
    
    if (preview) {
      return [
        'div',
        mergeAttributes(
          {
            'data-smart-link': 'true',
            class: 'smart-link-preview',
          },
          this.options.HTMLAttributes
        ),
        [
          'div',
          { class: 'smart-link-header' },
          [
            'a',
            {
              href,
              target: '_blank',
              rel: 'noopener noreferrer',
              class: 'smart-link-title',
            },
            title || href,
          ],
        ],
        [
          'div',
          { class: 'smart-link-url' },
          href,
        ],
      ];
    }

    return [
      'a',
      mergeAttributes(
        {
          'data-smart-link': 'true',
          href,
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'smart-link',
        },
        this.options.HTMLAttributes,
        HTMLAttributes
      ),
      title || href,
    ];
  },

  addCommands() {
    return {
      setSmartLink:
        (url: string, title?: string, preview: boolean = false) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { href: url, title, preview },
          });
        },
    };
  },
});