class MarkdownParser {
    constructor() {
        this.rules = [
            // Code blocks (должны идти первыми)
            { 
                pattern: /```([\s\S]*?)```/g, 
                replacement: '<pre><code>$1</code></pre>' 
            },
            
            // Inline code
            { 
                pattern: /`([^`\n]+)`/g, 
                replacement: '<code>$1</code>' 
            },
            
            // Headers
            { 
                pattern: /^### (.*$)/gm, 
                replacement: '<h3>$1</h3>' 
            },
            { 
                pattern: /^## (.*$)/gm, 
                replacement: '<h2>$1</h2>' 
            },
            { 
                pattern: /^# (.*$)/gm, 
                replacement: '<h1>$1</h1>' 
            },
            
            // Bold text (**text** or __text__)
            { 
                pattern: /\*\*((?:(?!\*\*).)*)\*\*/g, 
                replacement: '<strong>$1</strong>' 
            },
            { 
                pattern: /__((?:(?!__).)*?)__/g, 
                replacement: '<strong>$1</strong>' 
            },
            
            // Italic text (*text* or _text_)
            { 
                pattern: /\*((?:(?!\*).)*?)\*/g, 
                replacement: '<em>$1</em>' 
            },
            { 
                pattern: /_((?:(?!_).)*?)_/g, 
                replacement: '<em>$1</em>' 
            },
            
            // Strikethrough (~~text~~)
            { 
                pattern: /~~(.*?)~~/g, 
                replacement: '<del>$1</del>' 
            },
            
            // Links [text](url)
            { 
                pattern: /\[([^\]]+)\]\(([^)]+)\)/g, 
                replacement: '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>' 
            },
            
            // Blockquotes
            { 
                pattern: /^> (.*$)/gm, 
                replacement: '<blockquote>$1</blockquote>' 
            },
            
            // Unordered lists
            { 
                pattern: /^[\*\-\+] (.*$)/gm, 
                replacement: '<li>$1</li>' 
            },
            
            // Ordered lists
            { 
                pattern: /^\d+\. (.*$)/gm, 
                replacement: '<li>$1</li>' 
            },
            
            // Horizontal rule
            { 
                pattern: /^---$/gm, 
                replacement: '<hr>' 
            },
            
            // Tables (простая поддержка)
            { 
                pattern: /\|(.+)\|/g, 
                replacement: function(match, content) {
                    const cells = content.split('|').map(cell => cell.trim());
                    return '<tr>' + cells.map(cell => `<td>${cell}</td>`).join('') + '</tr>';
                }
            }
        ];
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    wrapLists(text) {
        // Wrap consecutive <li> elements in <ul> or <ol> tags
        text = text.replace(/(<li>.*?<\/li>)(\s*<li>.*?<\/li>)*/g, function(match) {
            return '<ul>' + match + '</ul>';
        });
        
        return text;
    }
    
    wrapParagraphs(text) {
        // Split by double newlines and wrap in paragraphs
        const paragraphs = text.split(/\n\s*\n/);
        return paragraphs.map(p => {
            const trimmed = p.trim();
            if (!trimmed) return '';
            
            // Don't wrap if already has block-level tags
            if (trimmed.match(/^<(h[1-6]|blockquote|pre|ul|ol|li|hr|table|tr|td)/)) {
                return trimmed;
            }
            
            return `<p>${trimmed}</p>`;
        }).join('\n');
    }
    
    processMath(text) {
        // Simple LaTeX-style math support
        // Inline math: $...$
        text = text.replace(/\$([^$\n]+)\$/g, '<span class="math-inline">$1</span>');
        
        // Block math: $$...$$
        text = text.replace(/\$\$([\s\S]*?)\$\$/g, '<div class="math-block">$1</div>');
        
        return text;
    }
    
    parse(markdown) {
        if (!markdown || typeof markdown !== 'string') {
            return '';
        }
        
        // First escape HTML to prevent XSS
        let html = this.escapeHtml(markdown);
        
        // Apply all markdown rules
        this.rules.forEach(rule => {
            if (typeof rule.replacement === 'function') {
                html = html.replace(rule.pattern, rule.replacement);
            } else {
                html = html.replace(rule.pattern, rule.replacement);
            }
        });
        
        // Process math expressions
        html = this.processMath(html);
        
        // Wrap lists
        html = this.wrapLists(html);
        
        // Convert single line breaks to <br>
        html = html.replace(/\n/g, '<br>');
        
        // Wrap in paragraphs
        html = this.wrapParagraphs(html);
        
        // Clean up empty paragraphs
        html = html.replace(/<p><\/p>/g, '');
        html = html.replace(/<p>\s*<\/p>/g, '');
        
        // Clean up multiple consecutive <br> tags
        html = html.replace(/(<br>\s*){3,}/g, '<br><br>');
        
        return html;
    }
    
    // Method for real-time parsing during streaming
    parseStreaming(text) {
        // For streaming, we want to be more conservative
        // to avoid breaking incomplete markdown
        
        if (!text || typeof text !== 'string') {
            return '';
        }
        
        let html = this.escapeHtml(text);
        
        // Only apply safe rules that won't break mid-stream
        const safeRules = [
            // Code blocks (only if complete)
            { 
                pattern: /```([\s\S]*?)```/g, 
                replacement: '<pre><code>$1</code></pre>' 
            },
            
            // Inline code (only if complete)
            { 
                pattern: /`([^`\n]+)`/g, 
                replacement: '<code>$1</code>' 
            },
            
            // Bold (only if complete)
            { 
                pattern: /\*\*((?:(?!\*\*).)*)\*\*/g, 
                replacement: '<strong>$1</strong>' 
            },
            
            // Italic (only if complete and not conflicting with bold)
            { 
                pattern: /(?<!\*)\*([^*\n]+)\*(?!\*)/g, 
                replacement: '<em>$1</em>' 
            },
            
            // Links (only if complete)
            { 
                pattern: /\[([^\]]+)\]\(([^)]+)\)/g, 
                replacement: '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>' 
            }
        ];
        
        safeRules.forEach(rule => {
            html = html.replace(rule.pattern, rule.replacement);
        });
        
        // Convert line breaks
        html = html.replace(/\n/g, '<br>');
        
        return html;
    }
}

// Export for use in other files
if (typeof window !== 'undefined') {
    window.MarkdownParser = MarkdownParser;
}

// AMD/CommonJS support
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MarkdownParser;
}