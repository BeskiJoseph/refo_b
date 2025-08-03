
const axios = require('axios');

class GroqService {
  constructor() {
    this.apiKey = process.env.GROQ_API_KEY;
    this.model = process.env.GROQ_MODEL || 'llama3-8b-8192';
    this.baseURL = 'https://api.groq.com/openai/v1';
  }

  generateRefactorPrompt(originalCode, language, settings = {}) {
    const languageInstructions = {
      javascript: 'JavaScript ES6+',
      typescript: 'TypeScript with proper type annotations',
      react: 'React functional components with hooks',
      nodejs: 'Node.js with modern async/await patterns'
    };

    const instruction = languageInstructions[language] || 'JavaScript';

    return `You are a world-class senior software engineer who strictly follows modern ${instruction} best practices. Your task is to refactor the following code snippet to:

1. Fix bad naming conventions (variables, functions, etc.)
2. Remove any unnecessary or dead code
3. Improve logic readability and structure
4. Add meaningful inline comments to explain complex logic
5. Format the code using Prettier and ESLint rules (Airbnb-style guide)
6. Convert callbacks to async/await where needed
7. Make the code modular, readable, and production-ready

${settings.addComments ? '8. Add helpful comments explaining the logic' : ''}
${settings.improveNaming ? '9. Ensure all variables and functions have descriptive names' : ''}
${settings.removeDeadCode ? '10. Remove any unused imports, variables, or functions' : ''}

You MUST return ONLY the refactored code — no explanations or extra text — and preserve the functionality.

Original code:
\`\`\`${language}
${originalCode}
\`\`\`

Refactored code:`;
  }

  async refactorCode(originalCode, language, settings = {}) {
    try {
      const prompt = this.generateRefactorPrompt(originalCode, language, settings);

      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.1,
          max_tokens: 4000,
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const refactoredCode = response.data.choices[0].message.content.trim();
      
      // Clean up the response - remove markdown code blocks if present
      const cleanedCode = refactoredCode
        .replace(/^```[\w]*\n/, '')
        .replace(/\n```$/, '')
        .trim();

      return {
        success: true,
        refactoredCode: cleanedCode,
        metrics: this.calculateMetrics(originalCode, cleanedCode),
        tokenUsage: response.data.usage
      };
    } catch (error) {
      console.error('Groq API Error:', error.response?.data || error.message);
      
      return {
        success: false,
        error: {
          message: error.response?.data?.error?.message || error.message,
          code: error.response?.status || 'UNKNOWN_ERROR'
        }
      };
    }
  }

  calculateMetrics(originalCode, refactoredCode) {
    const originalLines = originalCode.split('\n').filter(line => line.trim()).length;
    const refactoredLines = refactoredCode.split('\n').filter(line => line.trim()).length;
    
    return {
      originalLines,
      refactoredLines,
      linesReduced: Math.max(0, originalLines - refactoredLines),
      compressionRatio: originalLines > 0 ? (refactoredLines / originalLines) : 1,
      qualityScore: this.estimateQualityScore(originalCode, refactoredCode)
    };
  }

  estimateQualityScore(originalCode, refactoredCode) {
    let score = 3.0; // Base score
    
    // Check for improvements
    const hasAsyncAwait = refactoredCode.includes('async') && refactoredCode.includes('await');
    const hasComments = (refactoredCode.match(/\/\//g) || []).length > (originalCode.match(/\/\//g) || []).length;
    const hasBetterNaming = refactoredCode.length > originalCode.length * 0.8; // Assuming better names are longer
    
    if (hasAsyncAwait && originalCode.includes('callback')) score += 0.5;
    if (hasComments) score += 0.3;
    if (hasBetterNaming) score += 0.2;
    
    return Math.min(5.0, Math.max(1.0, score));
  }
}

module.exports = new GroqService();
