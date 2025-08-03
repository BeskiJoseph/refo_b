const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const path = require('path');
const groqService = require('../services/groqService');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/javascript', 'text/javascript', 'text/plain'];
    const allowedExtensions = ['.js', '.jsx', '.ts', '.tsx', '.json'];
    
    const hasValidType = allowedTypes.includes(file.mimetype);
    const hasValidExtension = allowedExtensions.some(ext => 
      file.originalname.toLowerCase().endsWith(ext)
    );
    
    if (hasValidType || hasValidExtension) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JavaScript files are allowed.'));
    }
  }
});

// Configure multer for zip file uploads
const uploadZip = multer({
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for zip files
  },
  fileFilter: (req, file, cb) => {
    const isZip = file.mimetype === 'application/zip' || 
                  file.originalname.toLowerCase().endsWith('.zip');
    
    if (isZip) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only ZIP files are allowed.'));
    }
  }
});

// Refactor code endpoint
router.post('/', async (req, res) => {
  try {
    const { code, language, settings = {} } = req.body;

    if (!code || !language) {
      return res.status(400).json({
        error: { message: 'Code and language are required' }
      });
    }

    // Perform refactoring using Groq
    const refactorResult = await groqService.refactorCode(code, language, settings);

    if (!refactorResult.success) {
      return res.status(500).json({
        error: { 
          message: 'Refactoring failed', 
          details: refactorResult.error.message 
        }
      });
    }

    res.json({
      success: true,
      data: {
        refactoredCode: refactorResult.refactoredCode,
        metrics: refactorResult.metrics,
        tokenUsage: refactorResult.tokenUsage
      }
    });
  } catch (error) {
    console.error('Refactor error:', error);
    res.status(500).json({
      error: { message: 'Refactoring failed', details: error.message }
    });
  }
});

// Upload file and refactor
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: { message: 'No file uploaded' }
      });
    }

    const code = req.file.buffer.toString('utf-8');
    const filename = req.file.originalname;
    
    // Auto-detect language based on file extension
    let language = 'javascript';
    if (filename.endsWith('.tsx') || filename.endsWith('.jsx')) {
      language = 'react';
    } else if (filename.endsWith('.ts')) {
      language = 'typescript';
    } else if (filename.includes('server') || filename.includes('api')) {
      language = 'nodejs';
    }

    // Refactor the uploaded code
    const refactorData = {
      code,
      language,
      settings: req.body.settings ? JSON.parse(req.body.settings) : {}
    };

    // Forward to refactor endpoint
    req.body = refactorData;
    return router.handle(req, res);
  } catch (error) {
    console.error('Upload refactor error:', error);
    res.status(500).json({
      error: { message: 'File upload and refactoring failed' }
    });
  }
});

// Get refactoring statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = {
      totalRefactors: 0,
      averageQualityScore: 4.2,
      languageBreakdown: {
        javascript: 45,
        react: 30,
        typescript: 20,
        nodejs: 5
      }
    };

    res.json({
      success: true,
      data: { stats }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      error: { message: 'Failed to get statistics' }
    });
  }
});

// Upload zip file, extract code files, and return their info (no refactoring yet)
router.post('/upload-zip', uploadZip.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: { message: 'No zip file uploaded' }
      });
    }

    const zip = new AdmZip(req.file.buffer);
    const zipEntries = zip.getEntries();
    // Filter for code files
    const codeFiles = zipEntries.filter(entry => {
      const ext = path.extname(entry.entryName).toLowerCase();
      return ['.js', '.jsx', '.ts', '.tsx', '.json'].includes(ext) && !entry.isDirectory;
    });
    if (codeFiles.length === 0) {
      return res.status(400).json({
        error: { message: 'No valid code files found in the zip archive' }
      });
    }
    // Return file info (original path, name, content)
    const files = codeFiles.map(file => ({
      path: file.entryName,
      name: path.basename(file.entryName),
      content: file.getData().toString('utf-8'),
    }));
    res.json({ success: true, files });
  } catch (error) {
    console.error('Zip upload error:', error);
    res.status(500).json({
      error: { message: 'Failed to process zip file', details: error.message }
    });
  }
});

// Refactor a list of files and return a clean zip with all refactored files in src/
router.post('/refactor-zip', async (req, res) => {
  try {
    const { files } = req.body;
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: { message: 'No files provided' } });
    }
    const outputZip = new AdmZip();
    let readmeContent = `# Refactored Project\n\nThis project was generated by CodeRefactor AI.\n\n## Files:\n`;
    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      let language = 'javascript';
      if (ext === '.jsx' || ext === '.tsx') language = 'react';
      else if (ext === '.ts') language = 'typescript';
      else if (ext === '.json') language = 'json';
      let refactoredCode = file.content;
      try {
        const result = await groqService.refactorCode(file.content, language, {});
        if (result.success && result.refactoredCode) {
          refactoredCode = result.refactoredCode;
        }
      } catch (e) {}
      outputZip.addFile(`src/${file.name}`, Buffer.from(refactoredCode, 'utf-8'));
      readmeContent += `- src/${file.name} (${refactoredCode.length} chars)\n`;
    }
    outputZip.addFile('README.md', Buffer.from(readmeContent, 'utf-8'));
    const outBuffer = outputZip.toBuffer();
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="refactored-project.zip"`,
      'Content-Length': outBuffer.length
    });
    return res.send(outBuffer);
  } catch (error) {
    console.error('Refactor zip error:', error);
    res.status(500).json({ error: { message: 'Failed to refactor zip', details: error.message } });
  }
});

// Add new endpoint for animated per-file code
router.post('/refactor-zip-animated', async (req, res) => {
  try {
    const { files } = req.body;
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: { message: 'No files provided' } });
    }
    const results = [];
    for (const file of files) {
      const ext = path.extname(file.name).toLowerCase();
      let language = 'javascript';
      if (ext === '.jsx' || ext === '.tsx') language = 'react';
      else if (ext === '.ts') language = 'typescript';
      else if (ext === '.json') language = 'json';
      let refactoredCode = file.content;
      let error = null;
      try {
        const result = await groqService.refactorCode(file.content, language, {});
        if (result.success && result.refactoredCode) {
          refactoredCode = result.refactoredCode;
        } else {
          error = result.error?.message || 'Unknown error';
        }
      } catch (e) {
        error = e.message;
      }
      results.push({ name: file.name, refactoredCode, error });
    }
    const allFailed = results.every(f => f.error);
    if (allFailed) {
      return res.status(500).json({ error: { message: 'All files failed to refactor', details: results.map(f => f.error).join('; ') } });
    }
    res.json({ success: true, files: results });
  } catch (error) {
    res.status(500).json({ error: { message: 'Failed to refactor zip', details: error.message } });
  }
});

module.exports = router;
