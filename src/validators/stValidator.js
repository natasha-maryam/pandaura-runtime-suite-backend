const ST_KEYWORDS = [
  'PROGRAM', 'END_PROGRAM', 'FUNCTION', 'END_FUNCTION', 'FUNCTION_BLOCK', 'END_FUNCTION_BLOCK',
  'VAR', 'END_VAR', 'VAR_INPUT', 'VAR_OUTPUT', 'VAR_IN_OUT', 'VAR_GLOBAL', 'VAR_TEMP',
  'IF', 'THEN', 'ELSIF', 'ELSE', 'END_IF',
  'CASE', 'OF', 'END_CASE',
  'FOR', 'TO', 'BY', 'DO', 'END_FOR',
  'WHILE', 'END_WHILE',
  'REPEAT', 'UNTIL', 'END_REPEAT',
  'RETURN', 'EXIT',
  'AND', 'OR', 'NOT', 'XOR', 'MOD',
  'TRUE', 'FALSE'
];

const ST_TYPES = [
  'BOOL', 'INT', 'DINT', 'REAL', 'LREAL', 'STRING', 'TIME', 'DATE', 'TOD', 'DT',
  'SINT', 'USINT', 'UINT', 'UDINT', 'LINT', 'ULINT', 'BYTE', 'WORD', 'DWORD', 'LWORD'
];

const VENDOR_SPECIFIC_RULES = {
  siemens: {
    preferredTypes: {
      'REAL': 'Consider using LREAL for higher precision',
      'INT': 'Consider using DINT for 32-bit operations'
    },
    specificKeywords: ['DB', 'FC', 'FB', 'OB'],
    warnings: [
      'Use structured data types (UDT) for better organization',
      'Consider using ARRAY for multiple similar variables'
    ]
  },
  rockwell: {
    preferredTypes: {
      'REAL': 'Consider using REAL for floating point operations instead of LREAL for better performance',
      'DINT': 'Consider using DINT instead of INT for better performance and range'
    },
    specificKeywords: ['AOI', 'UDT', 'TAG'],
    warnings: [
      'Use Add-On Instructions (AOI) for reusable code',
      'Consider using structured tags for better organization'
    ]
  },
  beckhoff: {
    preferredTypes: {
      'LREAL': 'Preferred for high-precision calculations',
      'UDINT': 'Use for positive integer values'
    },
    specificKeywords: ['ADSREAD', 'ADSWRITE', 'TCPIP'],
    warnings: [
      'Use interfaces for better code structure',
      'Consider using POINTER types for advanced memory operations'
    ]
  }
};

class STValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.info = [];
  }

  validate(content, vendor = 'neutral') {
    this.errors = [];
    this.warnings = [];
    this.info = [];

    const lines = content.split('\n');
    
    // Track block structure
    let programBlocks = [];
    let varBlocks = [];
    let ifBlocks = [];
    let forBlocks = [];
    let whileBlocks = [];
    let caseBlocks = [];
    
    // Track declared variables
    let declaredVars = new Set();
    let currentVarBlock = null;

    // Track multi-line comments
    let inMultiLineComment = false;
    let commentStartLine = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      const lineNum = i + 1;

      // Check for comment validation first
      const commentValidation = this.validateComments(line, lineNum, inMultiLineComment, commentStartLine);
      inMultiLineComment = commentValidation.inMultiLineComment;
      
      // Update comment start line tracking
      if (commentValidation.commentStartLine !== null) {
        commentStartLine = commentValidation.commentStartLine;
      }
      if (!inMultiLineComment) {
        commentStartLine = null;
      }
      
      // Skip processing if we're in a comment or it's an empty line
      if (trimmedLine === '' || commentValidation.isComment) {
        continue;
      }

      // If this line has code before a comment starts, validate that code
      let codeToValidate = line;
      if (commentValidation.hasCodeBeforeComment) {
        const commentStart = line.indexOf('(*');
        if (commentStart > 0) {
          codeToValidate = line.substring(0, commentStart);
        }
      }

      // Check block structure
      this.validateBlockStructure(trimmedLine, lineNum, {
        programBlocks,
        varBlocks,
        ifBlocks,
        forBlocks,
        whileBlocks,
        caseBlocks
      });

      // Variable declaration tracking
      if (trimmedLine.match(/^VAR/i)) {
        currentVarBlock = 'active';
      } else if (trimmedLine.match(/^END_VAR/i)) {
        currentVarBlock = null;
      } else if (currentVarBlock === 'active') {
        this.parseVariableDeclaration(trimmedLine, lineNum, declaredVars);
      }

      // Syntax validation (use original line for column calculations)
      this.validateSyntax(codeToValidate || trimmedLine, lineNum, declaredVars, vendor, line);
      
      // Statement validation
      this.validateStatements(codeToValidate || trimmedLine, lineNum);
      
      // Vendor-specific validation
      if (vendor !== 'neutral') {
        this.validateVendorSpecific(trimmedLine, lineNum, vendor);
      }
    }

    // Check for unclosed blocks
    this.validateUnclosedBlocks({
      programBlocks,
      varBlocks,
      ifBlocks,
      forBlocks,
      whileBlocks,
      caseBlocks
    }, lines.length);

    // Check for unclosed multi-line comments
    if (inMultiLineComment && commentStartLine !== null) {
      this.addError(commentStartLine, 1, 'Incomplete comment block - missing closing "*)"');
    }

    return {
      isValid: this.errors.length === 0,
      errors: [...this.errors, ...this.warnings, ...this.info]
    };
  }

  validateComments(line, lineNum, inMultiLineComment, commentStartLine) {
    const trimmedLine = line.trim();
    let currentInMultiLineComment = inMultiLineComment;
    let isComment = false;
    let newCommentStartLine = commentStartLine;
    let hasCodeBeforeComment = false;

    // Handle single-line comments
    const singleCommentIndex = line.indexOf('//');
    if (singleCommentIndex !== -1) {
      const beforeComment = line.substring(0, singleCommentIndex).trim();
      if (beforeComment === '' && trimmedLine.startsWith('//')) {
        isComment = true;
      } else if (beforeComment !== '') {
        hasCodeBeforeComment = true;
      }
      return { 
        isComment, 
        inMultiLineComment: currentInMultiLineComment, 
        commentStartLine: newCommentStartLine,
        hasCodeBeforeComment
      };
    }

    // Handle multi-line comments
    const commentStartIndex = line.indexOf('(*');
    const commentEndIndex = line.indexOf('*)');

    // If we're already in a multi-line comment
    if (currentInMultiLineComment) {
      if (commentEndIndex !== -1) {
        // Comment ends on this line
        currentInMultiLineComment = false;
        newCommentStartLine = null;
        // Check if there's more content after the comment end
        const afterComment = line.substring(commentEndIndex + 2).trim();
        if (afterComment === '') {
          isComment = true;
        }
        // If there's content after the comment, it needs to be validated
      } else {
        // Still in comment
        isComment = true;
      }
    } else {
      // Not in a comment yet
      if (commentStartIndex !== -1) {
        // Comment starts on this line
        if (commentEndIndex !== -1 && commentEndIndex > commentStartIndex) {
          // Single line comment (* ... *)
          const beforeComment = line.substring(0, commentStartIndex).trim();
          const afterComment = line.substring(commentEndIndex + 2).trim();
          if (beforeComment === '' && afterComment === '') {
            isComment = true;
          } else if (beforeComment !== '') {
            hasCodeBeforeComment = true;
          }
          // If there's code before or after, it needs to be validated
        } else {
          // Multi-line comment starts but doesn't end on this line
          currentInMultiLineComment = true;
          newCommentStartLine = lineNum;
          const beforeComment = line.substring(0, commentStartIndex).trim();
          if (beforeComment === '') {
            isComment = true;
          } else {
            hasCodeBeforeComment = true;
          }
        }
      }
    }

    return { 
      isComment, 
      inMultiLineComment: currentInMultiLineComment, 
      commentStartLine: newCommentStartLine,
      hasCodeBeforeComment
    };
  }

  validateBlockStructure(line, lineNum, blocks) {
    // PROGRAM blocks
    if (line.match(/^PROGRAM\s+\w+/i)) {
      blocks.programBlocks.push(lineNum);
    } else if (line.match(/^END_PROGRAM/i)) {
      if (blocks.programBlocks.length === 0) {
        this.addError(lineNum, 1, 'END_PROGRAM without matching PROGRAM');
      } else {
        blocks.programBlocks.pop();
      }
    }

    // VAR blocks
    if (line.match(/^VAR/i)) {
      blocks.varBlocks.push(lineNum);
    } else if (line.match(/^END_VAR/i)) {
      if (blocks.varBlocks.length === 0) {
        this.addError(lineNum, 1, 'END_VAR without matching VAR');
      } else {
        blocks.varBlocks.pop();
      }
    }

    // IF blocks
    if (line.match(/^IF\s+/i)) {
      blocks.ifBlocks.push(lineNum);
    } else if (line.match(/^END_IF/i)) {
      if (blocks.ifBlocks.length === 0) {
        this.addError(lineNum, 1, 'END_IF without matching IF');
      } else {
        blocks.ifBlocks.pop();
      }
    }

    // FOR blocks
    if (line.match(/^FOR\s+/i)) {
      blocks.forBlocks.push(lineNum);
    } else if (line.match(/^END_FOR/i)) {
      if (blocks.forBlocks.length === 0) {
        this.addError(lineNum, 1, 'END_FOR without matching FOR');
      } else {
        blocks.forBlocks.pop();
      }
    }

    // WHILE blocks
    if (line.match(/^WHILE\s+/i)) {
      blocks.whileBlocks.push(lineNum);
    } else if (line.match(/^END_WHILE/i)) {
      if (blocks.whileBlocks.length === 0) {
        this.addError(lineNum, 1, 'END_WHILE without matching WHILE');
      } else {
        blocks.whileBlocks.pop();
      }
    }

    // CASE blocks
    if (line.match(/^CASE\s+/i)) {
      blocks.caseBlocks.push(lineNum);
    } else if (line.match(/^END_CASE/i)) {
      if (blocks.caseBlocks.length === 0) {
        this.addError(lineNum, 1, 'END_CASE without matching CASE');
      } else {
        blocks.caseBlocks.pop();
      }
    }
  }

  parseVariableDeclaration(line, lineNum, declaredVars, currentScope = 'global') {
    // Enhanced parsing for variable declarations in VAR blocks
    // Format variations:
    // VarName : DataType;
    // VarName : DataType := InitialValue;
    // VarName AT %I0.0 : BOOL;
    // VarName : ARRAY[0..10] OF INT;
    
    // Skip if line is empty or comment
    if (!line.trim() || line.trim().startsWith('//') || line.trim().startsWith('(*')) {
      return;
    }
    
    const varDeclarationPattern = /^\s*(\w+)(?:\s+AT\s+%[IQMF][\d.]+)?\s*:\s*(.*?)(?:;|$)/i;
    const match = line.match(varDeclarationPattern);
    
    if (match) {
      const varName = match[1];
      const dataTypeSection = match[2].trim();
      
      // Handle complex data types
      let dataType = dataTypeSection.split(':=')[0].trim(); // Remove initial value
      
      // Extract base type from complex types like ARRAY[0..10] OF INT
      const arrayMatch = dataType.match(/ARRAY\[.*?\]\s+OF\s+(\w+)/i);
      if (arrayMatch) {
        dataType = arrayMatch[1].toUpperCase();
      }
      
      // Check for duplicate declarations within same scope
      const scopedVarName = `${currentScope}.${varName}`;
      if (declaredVars.has(scopedVarName)) {
        this.addWarning(lineNum, 1, `Variable '${varName}' is already declared in current scope`);
      } else {
        declaredVars.add(scopedVarName);
        // Also add without scope for backward compatibility
        declaredVars.add(varName);
      }
      
      // Validate data type
      const baseDataType = dataType.toUpperCase();
      if (!ST_TYPES.includes(baseDataType) && 
          !ST_KEYWORDS.includes(baseDataType) && 
          !baseDataType.startsWith('ARRAY') &&
          !this.isUserDefinedType(baseDataType)) {
        this.addWarning(lineNum, line.indexOf(dataType), `Unknown or invalid data type '${dataType}'`);
      }
      
      // Check naming conventions
      if (!this.isValidVariableName(varName)) {
        this.addWarning(lineNum, line.indexOf(varName), `Variable name '${varName}' doesn't follow recommended naming conventions`);
      }
    }
  }
  
  isUserDefinedType(typeName) {
    // Common user-defined types patterns
    const udtPatterns = [
      /^T_/,     // Type prefix
      /^ST_/,    // Structure prefix
      /^UDT_/,   // User-defined type prefix
      /^FB_/,    // Function block prefix
      /.*_TYPE$/ // Type suffix
    ];
    
    return udtPatterns.some(pattern => pattern.test(typeName));
  }
  
  isValidVariableName(name) {
    // Check for recommended naming conventions
    // - Should start with letter or underscore
    // - Should not be too short (< 2 chars) unless common abbreviations
    // - Should not be all uppercase (reserved for constants)
    
    if (name.length < 2 && !['I', 'O', 'Q', 'M'].includes(name)) {
      return false;
    }
    
    if (name === name.toUpperCase() && name.length > 1 && !name.startsWith('_')) {
      return false; // Probably a constant, should be declared differently
    }
    
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
  }

  checkUndeclaredVariables(line, lineNum, declaredVars) {
    // Enhanced undeclared variable detection
    
    // Skip if line is empty, comment, or variable declaration
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('(*') ||
        trimmedLine.toUpperCase().startsWith('VAR') || trimmedLine.toUpperCase() === 'END_VAR') {
      return;
    }
    
    // Skip structural declarations (PROGRAM, FUNCTION, FUNCTION_BLOCK names)
    if (this.isStructuralDeclaration(trimmedLine)) {
      return;
    }
    
    // Find all potential variable references
    const variablePattern = /\b([a-zA-Z_]\w*)\b/g;
    const variables = [];
    let match;
    
    while ((match = variablePattern.exec(line)) !== null) {
      variables.push({
        name: match[1],
        position: match.index
      });
    }
    
    for (const variable of variables) {
      const varName = variable.name;
      const position = variable.position;
      
      // Skip if it's a keyword, built-in function, or data type
      if (this.isKeywordOrBuiltin(varName)) {
        continue;
      }
      
      // Skip if it's part of a function call (followed by parentheses)
      const nextChar = line.charAt(position + varName.length);
      if (nextChar === '(') {
        continue;
      }
      
      // Skip if it's a constant (all uppercase, not a data type)
      if (varName === varName.toUpperCase() && varName.length > 2 && 
          !ST_TYPES.includes(varName) && !ST_KEYWORDS.includes(varName)) {
        continue;
      }
      
      // Skip if it's part of a structural declaration in this line
      if (this.isPartOfStructuralDeclaration(line, varName, position)) {
        continue;
      }
      
      // Check if variable is declared
      if (!declaredVars.has(varName)) {
        // Check for common patterns that shouldn't be flagged
        if (!this.shouldSkipUndeclaredCheck(line, varName, position)) {
          this.addError(lineNum, position + 1, 
            `Undeclared variable '${varName}' - not found in any VAR section`);
        }
      }
    }
  }
  
  isKeywordOrBuiltin(name) {
    const upperName = name.toUpperCase();
    
    // ST Keywords
    if (ST_KEYWORDS.includes(upperName) || ST_TYPES.includes(upperName)) {
      return true;
    }
    
    // Built-in functions
    const builtinFunctions = [
      'ABS', 'SQRT', 'LN', 'LOG', 'EXP', 'SIN', 'COS', 'TAN', 'ASIN', 'ACOS', 'ATAN',
      'MAX', 'MIN', 'LIMIT', 'MUX', 'SEL',
      'LEN', 'LEFT', 'RIGHT', 'MID', 'CONCAT', 'INSERT', 'DELETE', 'REPLACE', 'FIND',
      'TON', 'TOF', 'TP', 'CTU', 'CTD', 'CTUD',
      'RS', 'SR', 'R_TRIG', 'F_TRIG',
      'MOVE', 'SHL', 'SHR', 'ROL', 'ROR'
    ];
    
    if (builtinFunctions.includes(upperName)) {
      return true;
    }
    
    // System variables and I/O addresses
    if (/^%[IQMF]/.test(name) || /^[IQMF]\d+/.test(name)) {
      return true;
    }
    
    return false;
  }
  
  isStructuralDeclaration(line) {
    // Check if this line declares a PROGRAM, FUNCTION, or FUNCTION_BLOCK
    const structuralPatterns = [
      /^\s*PROGRAM\s+\w+/i,
      /^\s*FUNCTION\s+\w+/i,
      /^\s*FUNCTION_BLOCK\s+\w+/i,
      /^\s*END_PROGRAM/i,
      /^\s*END_FUNCTION/i,
      /^\s*END_FUNCTION_BLOCK/i
    ];
    
    return structuralPatterns.some(pattern => pattern.test(line));
  }
  
  isPartOfStructuralDeclaration(line, varName, position) {
    // Check if the variable is part of a PROGRAM, FUNCTION, or FUNCTION_BLOCK declaration
    const upperLine = line.toUpperCase();
    
    // Check for PROGRAM declarations: "PROGRAM ProgramName"
    if (upperLine.includes('PROGRAM ')) {
      const programMatch = line.match(/PROGRAM\s+(\w+)/i);
      if (programMatch && programMatch[1] === varName) {
        return true;
      }
    }
    
    // Check for FUNCTION declarations: "FUNCTION FunctionName : ReturnType"
    if (upperLine.includes('FUNCTION ')) {
      const functionMatch = line.match(/FUNCTION\s+(\w+)/i);
      if (functionMatch && functionMatch[1] === varName) {
        return true;
      }
    }
    
    // Check for FUNCTION_BLOCK declarations: "FUNCTION_BLOCK FBName"
    if (upperLine.includes('FUNCTION_BLOCK ')) {
      const fbMatch = line.match(/FUNCTION_BLOCK\s+(\w+)/i);
      if (fbMatch && fbMatch[1] === varName) {
        return true;
      }
    }
    
    return false;
  }

  shouldSkipUndeclaredCheck(line, varName, position) {
    // Skip if variable is in a comment
    const commentStart = line.indexOf('(*');
    const singleCommentStart = line.indexOf('//');
    
    if ((commentStart !== -1 && position > commentStart) ||
        (singleCommentStart !== -1 && position > singleCommentStart)) {
      return true;
    }
    
    // Skip if it's part of an attribute or pragma
    if (line.includes('{') && line.includes('}')) {
      const attrStart = line.indexOf('{');
      const attrEnd = line.indexOf('}');
      if (position > attrStart && position < attrEnd) {
        return true;
      }
    }
    
    // Skip if it's a label (followed by colon)
    const nextChar = line.charAt(position + varName.length);
    if (nextChar === ':' && !line.includes(':=')) {
      return true;
    }
    
    return false;
  }

  validateSyntax(line, lineNum, declaredVars, vendor, originalLine = null) {
    const lineToCheck = originalLine || line;
    
    // Check for common syntax errors
    
    // If the line has an incomplete comment, we might still need to validate the code before the comment
    const commentStartIndex = lineToCheck.indexOf('(*');
    const hasIncompleteComment = commentStartIndex !== -1 && !lineToCheck.includes('*)');
    
    // If there's an incomplete comment but no code before it, skip validation
    if (hasIncompleteComment && commentStartIndex === 0) {
      return;
    }
    
    // Assignment without semicolon
    if (line.includes(':=') && !line.trim().endsWith(';')) {
      // Check if this is part of a comment in the original line
      const assignmentIndex = line.indexOf(':=');
      const commentStartIndex = lineToCheck.indexOf('(*');
      const singleCommentIndex = lineToCheck.indexOf('//');
      
      // Only flag if assignment is not inside a comment
      const isInComment = (commentStartIndex !== -1 && assignmentIndex > commentStartIndex) ||
                         (singleCommentIndex !== -1 && assignmentIndex > singleCommentIndex);
      
      if (!isInComment) {
        this.addWarning(lineNum, line.length, 'Assignment statement should end with semicolon');
      }
    }

    // Enhanced undeclared variable detection with scope awareness
    this.checkUndeclaredVariables(line, lineNum, declaredVars);

    // Check for proper IF-THEN structure
    if (line.match(/^IF\s+/i) && !line.match(/THEN/i)) {
      this.addError(lineNum, line.length, 'IF statement must be followed by THEN');
    }

    // Check FOR loop structure
    if (line.match(/^FOR\s+/i)) {
      if (!line.match(/TO\s+/i)) {
        this.addError(lineNum, line.length, 'FOR statement must include TO keyword');
      }
      if (!line.match(/DO\s*$/i)) {
        this.addError(lineNum, line.length, 'FOR statement must end with DO');
      }
    }

    // Check CASE structure
    if (line.match(/^CASE\s+/i) && !line.match(/OF\s*$/i)) {
      this.addError(lineNum, line.length, 'CASE statement must end with OF');
    }

    // Check for proper string literals
    const stringMatches = line.match(/'[^']*'/g);
    if (stringMatches) {
      stringMatches.forEach(str => {
        if (str.length < 2 || !str.endsWith("'")) {
          this.addError(lineNum, line.indexOf(str) + 1, 'Unterminated string literal');
        }
      });
    }
  }

  validateStatements(line, lineNum) {
    // Check for empty statements
    if (line.trim() === ';') {
      this.addWarning(lineNum, 1, 'Empty statement');
    }

    // Check for multiple statements on one line
    const semicolonCount = (line.match(/;/g) || []).length;
    const commentStart = line.indexOf('(*');
    const actualSemicolons = commentStart >= 0 ? 
      (line.substring(0, commentStart).match(/;/g) || []).length : semicolonCount;
    
    if (actualSemicolons > 1) {
      this.addInfo(lineNum, 1, 'Consider splitting multiple statements into separate lines for better readability');
    }
  }

  validateVendorSpecific(line, lineNum, vendor) {
    const rules = VENDOR_SPECIFIC_RULES[vendor];
    if (!rules) return;

    // Check for non-preferred types and suggest alternatives
    Object.keys(rules.preferredTypes).forEach(preferredType => {
      const message = rules.preferredTypes[preferredType];
      
      // Only suggest REAL if the line contains other floating point types (LREAL) but not REAL
      if (preferredType === 'REAL' && message.includes('floating point')) {
        if (line.includes('LREAL') && !line.includes(': REAL')) {
          this.addInfo(lineNum, line.indexOf('LREAL') + 1, message);
        }
      }
      // Only suggest LREAL if the line contains REAL but not LREAL  
      else if (preferredType === 'LREAL' && message.includes('precision')) {
        if (line.includes(': REAL') && !line.includes('LREAL')) {
          this.addInfo(lineNum, line.indexOf('REAL') + 1, message);
        }
      }
      // Only suggest DINT if the line contains INT but not DINT
      else if (preferredType === 'DINT' && message.includes('32-bit')) {
        if (line.includes(': INT') && !line.includes('DINT')) {
          this.addInfo(lineNum, line.indexOf('INT') + 1, message);
        }
      }
      // Only suggest UDINT if the line contains other integer types for positive values
      else if (preferredType === 'UDINT' && message.includes('positive')) {
        if ((line.includes(': INT') || line.includes(': DINT')) && !line.includes('UDINT')) {
          this.addInfo(lineNum, line.indexOf('INT') + 1, message);
        }
      }
    });

    // Check for vendor-specific keywords (this is informational, not a suggestion)
    rules.specificKeywords.forEach(keyword => {
      if (line.toUpperCase().includes(keyword)) {
        this.addInfo(lineNum, line.toUpperCase().indexOf(keyword) + 1, `${vendor.charAt(0).toUpperCase() + vendor.slice(1)}-specific keyword detected`);
      }
    });
  }

  validateUnclosedBlocks(blocks, totalLines) {
    Object.entries(blocks).forEach(([blockType, blockArray]) => {
      if (blockArray.length > 0) {
        const blockName = blockType.replace('Blocks', '').replace(/([A-Z])/g, '_$1').toUpperCase();
        blockArray.forEach(lineNum => {
          this.addError(totalLines, 1, `Unclosed ${blockName} block started at line ${lineNum}`);
        });
      }
    });
  }



  addError(line, column, message) {
    this.errors.push({
      line,
      column,
      severity: 'error',
      message
    });
  }

  addWarning(line, column, message) {
    this.warnings.push({
      line,
      column,
      severity: 'warning',
      message
    });
  }

  addInfo(line, column, message) {
    this.info.push({
      line,
      column,
      severity: 'info',
      message
    });
  }
}

module.exports = { STValidator };