import React, { useState } from 'react';
import { ConfluenceEditor } from './ConfluenceEditor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import './editor.css';

export const EditorDemo: React.FC = () => {
  const [content, setContent] = useState('<h1>Welcome to the Confluence Editor</h1><p>Start typing to see the magic happen...</p>');
  const [savedContent, setSavedContent] = useState('');

  const handleSave = () => {
    setSavedContent(content);
    alert('Content saved!');
  };

  const mockMentions = [
    { id: '1', label: 'John Doe', avatar: '' },
    { id: '2', label: 'Jane Smith', avatar: '' },
    { id: '3', label: 'Bob Johnson', avatar: '' }
  ];

  const customMacros = [
    {
      id: 'meeting-notes',
      name: 'Meeting Notes',
      description: 'Template for meeting notes',
      category: 'Templates',
      insertHtml: `
        <div class="macro-meeting-notes">
          <h3>Meeting Notes</h3>
          <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          <p><strong>Attendees:</strong> </p>
          <h4>Agenda</h4>
          <ul><li>Item 1</li><li>Item 2</li></ul>
          <h4>Action Items</h4>
          <ul><li>[ ] Action 1</li><li>[ ] Action 2</li></ul>
        </div>
      `,
      tags: ['meeting', 'notes', 'template']
    }
  ];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Confluence-Style Rich Text Editor</CardTitle>
          <CardDescription>
            A comprehensive editor with all Confluence features: formatting, tables, layouts, macros, and more.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <ConfluenceEditor
              content={content}
              onChange={setContent}
              onSave={handleSave}
              placeholder="Start typing your content..."
              mentions={mockMentions}
              macros={customMacros}
            />
            
            <div className="flex gap-2">
              <Button onClick={handleSave} variant="default">
                Save Content
              </Button>
              <Button 
                onClick={() => setContent('')} 
                variant="outline"
              >
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {savedContent && (
        <Card>
          <CardHeader>
            <CardTitle>Saved Content Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div 
              className="prose max-w-none"
              dangerouslySetInnerHTML={{ __html: savedContent }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
};