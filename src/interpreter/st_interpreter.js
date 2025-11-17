// st_interpreter.js
// Full-featured ST interpreter for Node.js
// Supports: dynamic VAR detection, timers in ms, FB instances, arrays, assignments, expressions, IF/WHILE/FOR

class Token {
  constructor(type, value, pos) {
    this.type = type;
    this.value = value;
    this.pos = pos;
  }
}

class Tokenizer {
  constructor(input) {
    this.input = input;
    this.pos = 0;
    this.tokens = [];
    this.keywords = new Set([
      'VAR','END_VAR','IF','THEN','END_IF','ELSE','ELSIF',
      'WHILE','END_WHILE','FOR','END_FOR','TO','DO','EXIT',
      'TRUE','FALSE','AND','OR','NOT','MOD','DIV','BY',
      'STRING','REAL','INT','BOOL','ARRAY','OF',
      'TON','TOF','TP','R_TRIG','F_TRIG',
      'PROGRAM','END_PROGRAM','FUNCTION','END_FUNCTION',
      'FUNCTION_BLOCK','END_FUNCTION_BLOCK'
    ]);
  }

  isAlpha(c){ return /[A-Za-z_]/.test(c); }
  isDigit(c){ return /[0-9]/.test(c); }
  isAlnum(c){ return /[A-Za-z0-9_]/.test(c); }
  peek(n=0){ return this.input[this.pos+n] || ''; }
  next(){ return this.input[this.pos++] || ''; }
  eof(){ return this.pos >= this.input.length; }

  skipWhitespace(){
    while(!this.eof()){
      const c = this.peek();
      if(/\s/.test(c)) { this.next(); continue; }
      if(c === '/' && this.peek(1) === '/'){ // single-line comment
        this.next(); this.next();
        while(!this.eof() && this.peek() !== '\n') this.next();
        continue;
      }
      if(c === '(' && this.peek(1) === '*'){ // multi-line comment
        this.next(); this.next();
        while(!this.eof() && !(this.peek() === '*' && this.peek(1) === ')')) this.next();
        if(!this.eof()){ this.next(); this.next(); }
        continue;
      }
      break;
    }
  }

  matchRegex(re){
    const m = this.input.slice(this.pos).match(re);
    if(m && m.index === 0){
      this.pos += m[0].length;
      return m[0];
    }
    return null;
  }

  tokenize(){
    while(!this.eof()){
      this.skipWhitespace();
      if(this.eof()) break;
      const c = this.peek();

      // identifiers/keywords
      if(this.isAlpha(c)){
        const id = this.matchRegex(/^[A-Za-z_][A-Za-z0-9_]*/);
        const upper = id.toUpperCase();
        if(this.keywords.has(upper)){
          this.tokens.push(new Token('KW', upper, this.pos));
        } else {
          this.tokens.push(new Token('IDENT', id, this.pos));
        }
        continue;
      }

      // numbers
      if(this.isDigit(c) || (c === '.' && this.isDigit(this.peek(1)))){
        const num = this.matchRegex(/^[0-9]+(\.[0-9]+)?/);
        this.tokens.push(new Token('NUMBER', num, this.pos));
        continue;
      }

      // time literals
      if((c === 'T' || c === 't') && this.peek(1) === '#'){
        const timeLit = this.matchRegex(/^[Tt]#[0-9]+(\.[0-9]+)?(ms|s|m|h|d)?/i);
        if(timeLit){
          this.tokens.push(new Token('TIME', timeLit, this.pos));
          continue;
        }
      }
      if(this.input.slice(this.pos, this.pos + 5).toUpperCase() === 'TIME#'){
        const timeLit = this.matchRegex(/^TIME#[0-9]+(\.[0-9]+)?(ms|s|m|h|d)?/i);
        if(timeLit){
          this.tokens.push(new Token('TIME', timeLit, this.pos));
          continue;
        }
      }

      // strings
      if(c === '"' || c === "'"){
        const q = this.next();
        let str = '';
        while(!this.eof() && this.peek() !== q){
          if(this.peek() === '\\'){ this.next(); const esc = this.next(); str += esc; }
          else str += this.next();
        }
        if(this.peek() === q) this.next();
        this.tokens.push(new Token('STRING', str, this.pos));
        continue;
      }

      // operators
      const two = c + this.peek(1);
      if([':=','<=','>=','<>','!='].includes(two)){
        this.next(); this.next();
        this.tokens.push(new Token('OP', two, this.pos));
        continue;
      }

      // single char
      const single = this.next();
      if('+-*/%=()[];,.:<>'.includes(single)){
        this.tokens.push(new Token(single, single, this.pos));
        continue;
      }
    }

    this.tokens.push(new Token('EOF', null, this.pos));
    return this.tokens;
  }
}

function expectToken(tokens, iRef, typeOrValue){
  const t = tokens[iRef.i];
  if(!t) throw new Error(`Unexpected EOF, expected ${typeOrValue}`);
  if(t.type === typeOrValue || t.value === typeOrValue || t.type === typeOrValue) {
    iRef.i++;
    return t;
  }
  throw new Error(`Unexpected token ${t.type}:${t.value} at pos ${t.pos}, expected ${typeOrValue}`);
}

function peekToken(tokens, iRef){
  return tokens[iRef.i] || new Token('EOF', null, -1);
}

class Parser {
  constructor(tokens){
    this.tokens = tokens;
    this.iRef = { i: 0 };
  }

  parseProgram(){
    const declarations = [];
    const statements = [];
    let tk = peekToken(this.tokens, this.iRef);
    if(tk.type === 'KW' && tk.value === 'PROGRAM'){
      expectToken(this.tokens, this.iRef, 'KW');
      expectToken(this.tokens, this.iRef, 'IDENT');
    }
    while(peekToken(this.tokens, this.iRef).type !== 'EOF'){
      tk = peekToken(this.tokens, this.iRef);
      if(tk.type === 'KW' && tk.value === 'END_PROGRAM'){ expectToken(this.tokens, this.iRef, 'KW'); break; }
      if(tk.type === 'KW' && tk.value === 'VAR'){
        declarations.push(...this.parseVarBlock());
        continue;
      }
      statements.push(this.parseStatement());
    }
    return { type: 'Program', declarations, statements };
  }

  parseVarBlock(){
    expectToken(this.tokens, this.iRef, 'KW'); // VAR
    const vars = [];
    while(true){
      const p = peekToken(this.tokens, this.iRef);
      if(p.type === 'KW' && p.value === 'END_VAR'){ expectToken(this.tokens, this.iRef, 'KW'); break; }
      const nameTok = expectToken(this.tokens, this.iRef, 'IDENT');
      expectToken(this.tokens, this.iRef, ':');
      const typeTok = peekToken(this.tokens, this.iRef);
      let type = null;
      if(typeTok.type === 'KW'){
        type = typeTok.value; this.iRef.i++;
        if(type==='ARRAY'){
          expectToken(this.tokens, this.iRef,'[');
          const low = expectToken(this.tokens, this.iRef,'NUMBER').value;
          expectToken(this.tokens, this.iRef,'.'); expectToken(this.tokens, this.iRef,'.');
          const high = expectToken(this.tokens, this.iRef,'NUMBER').value;
          expectToken(this.tokens, this.iRef,']');
          expectToken(this.tokens, this.iRef,'KW'); // OF
          const baseType = expectToken(this.tokens, this.iRef,'KW').value;
          type = { kind:'ARRAY', low:parseInt(low), high:parseInt(high), base: baseType };
        }
      } else if(typeTok.type==='IDENT'){ type=typeTok.value; this.iRef.i++; }
      else throw new Error(`Unknown type ${typeTok.value}`);
      let init = null;
      const maybe = peekToken(this.tokens, this.iRef);
      if(maybe.type==='OP' && maybe.value===':='){ expectToken(this.tokens,this.iRef,'OP'); init=this.parseExpression(); }
      expectToken(this.tokens,this.iRef,';');
      vars.push({ name:nameTok.value, type, init });
    }
    return vars;
  }

  parseStatement(){ 
    const tk = peekToken(this.tokens,this.iRef);
    if(tk.type==='IDENT') return this.parseAssignmentOrCall();
    if(tk.type==='KW'){
      switch(tk.value){
        case 'IF': return this.parseIf();
        case 'WHILE': return this.parseWhile();
        case 'FOR': return this.parseFor();
        case 'TON': case 'TOF': case 'TP': case 'R_TRIG': case 'F_TRIG':
          return this.parseAssignmentOrCall();
        default: throw new Error(`Unsupported keyword at statement: ${tk.value}`);
      }
    }
    if(tk.type===';'){ this.iRef.i++; return { type:'Nop' }; }
    throw new Error(`Unexpected token in statement: ${tk.type}:${tk.value}`);
  }

  parseAssignmentOrCall(){
    const leftTok = expectToken(this.tokens,this.iRef,'IDENT');
    let left = { type:'Var', name:leftTok.value };
    while(peekToken(this.tokens,this.iRef).value==='['){
      expectToken(this.tokens,this.iRef,'[');
      const idx = this.parseExpression();
      expectToken(this.tokens,this.iRef,']');
      left={ type:'ArrayRef', name:left.name, index:idx };
    }
    const next = peekToken(this.tokens,this.iRef);
    if(next.type==='OP' && next.value===':='){
      expectToken(this.tokens,this.iRef,'OP');
      const expr=this.parseExpression();
      expectToken(this.tokens,this.iRef,';');
      return { type:'Assign', left, expr };
    }
    if(next.value==='('){
      expectToken(this.tokens,this.iRef,'(');
      const args=[];
      while(peekToken(this.tokens,this.iRef).value!==')'){
        const keyOrExpr=peekToken(this.tokens,this.iRef);
        if(keyOrExpr.type==='IDENT' && peekToken(this.tokens,this.iRef).value!==':='){ args.push(this.parseExpression()); }
        else{
          const key=expectToken(this.tokens,this.iRef,'IDENT').value;
          expectToken(this.tokens,this.iRef,'OP');
          const val=this.parseExpression();
          args.push({name:key,value:val});
        }
        if(peekToken(this.tokens,this.iRef).value===',') expectToken(this.tokens,this.iRef,',');
      }
      expectToken(this.tokens,this.iRef,')'); expectToken(this.tokens,this.iRef,';');
      return { type:'Call', name:left.name, args };
    }
    throw new Error(`Unexpected token after identifier: ${next.type}:${next.value}`);
  }

  parseIf(){ 
    expectToken(this.tokens,this.iRef,'KW'); // IF
    const cond=this.parseExpression(); expectToken(this.tokens,this.iRef,'KW'); // THEN
    const thenStmts=[]; while(true){ const p=peekToken(this.tokens,this.iRef); if(p.type==='KW'&&(p.value==='ELSIF'||p.value==='ELSE'||p.value==='END_IF')) break; thenStmts.push(this.parseStatement()); }
    const elsifBlocks=[]; while(peekToken(this.tokens,this.iRef).type==='KW' && peekToken(this.tokens,this.iRef).value==='ELSIF'){ expectToken(this.tokens,this.iRef,'KW'); const ec=this.parseExpression(); expectToken(this.tokens,this.iRef,'KW'); const estmts=[]; while(true){ const p=peekToken(this.tokens,this.iRef); if(p.type==='KW'&&(p.value==='ELSIF'||p.value==='ELSE'||p.value==='END_IF')) break; estmts.push(this.parseStatement()); } elsifBlocks.push({cond:ec,stmts:estmts}); }
    let elseStmts=[]; if(peekToken(this.tokens,this.iRef).type==='KW' && peekToken(this.tokens,this.iRef).value==='ELSE'){ expectToken(this.tokens,this.iRef,'KW'); while(true){ const p=peekToken(this.tokens,this.iRef); if(p.type==='KW' && p.value==='END_IF') break; elseStmts.push(this.parseStatement()); } }
    expectToken(this.tokens,this.iRef,'KW'); // END_IF
    if(peekToken(this.tokens,this.iRef).value===';') expectToken(this.tokens,this.iRef,';');
    return { type:'If', cond, thenStmts, elsifBlocks, elseStmts };
  }

  parseWhile(){ expectToken(this.tokens,this.iRef,'KW'); const cond=this.parseExpression(); expectToken(this.tokens,this.iRef,'KW'); const body=[]; while(!(peekToken(this.tokens,this.iRef).type==='KW' && peekToken(this.tokens,this.iRef).value==='END_WHILE')) body.push(this.parseStatement()); expectToken(this.tokens,this.iRef,'KW'); if(peekToken(this.tokens,this.iRef).value===';') expectToken(this.tokens,this.iRef,';'); return { type:'While', cond, body }; }

  parseFor(){ expectToken(this.tokens,this.iRef,'KW'); const varName=expectToken(this.tokens,this.iRef,'IDENT').value; expectToken(this.tokens,this.iRef,':='); const start=this.parseExpression(); expectToken(this.tokens,this.iRef,'KW'); const endExpr=this.parseExpression(); let step=null; if(peekToken(this.tokens,this.iRef).type==='KW' && peekToken(this.tokens,this.iRef).value==='BY'){ expectToken(this.tokens,this.iRef,'KW'); step=this.parseExpression(); } expectToken(this.tokens,this.iRef,'KW'); const body=[]; while(!(peekToken(this.tokens,this.iRef).type==='KW' && peekToken(this.tokens,this.iRef).value==='END_FOR')) body.push(this.parseStatement()); expectToken(this.tokens,this.iRef,'KW'); if(peekToken(this.tokens,this.iRef).value===';') expectToken(this.tokens,this.iRef,';'); return { type:'For', varName, start, end:endExpr, step, body }; }

  parseExpression(){ return this.parseOr(); }
  parseOr(){ let node=this.parseAnd(); while(peekToken(this.tokens,this.iRef).type==='KW' && peekToken(this.tokens,this.iRef).value==='OR'){ expectToken(this.tokens,this.iRef,'KW'); node={type:'Binary',op:'OR',left:node,right:this.parseAnd()}; } return node; }
  parseAnd(){ let node=this.parseNot(); while(peekToken(this.tokens,this.iRef).type==='KW' && peekToken(this.tokens,this.iRef).value==='AND'){ expectToken(this.tokens,this.iRef,'KW'); node={type:'Binary',op:'AND',left:node,right:this.parseNot()}; } return node; }
  parseNot(){ if(peekToken(this.tokens,this.iRef).type==='KW' && peekToken(this.tokens,this.iRef).value==='NOT'){ expectToken(this.tokens,this.iRef,'KW'); return {type:'Unary',op:'NOT',expr:this.parseComparison()}; } return this.parseComparison(); }
  parseComparison(){ let left=this.parseAdd(); const p=peekToken(this.tokens,this.iRef); if(p.value && ['=','<>','!=','<','>','<=','>='].includes(p.value)){ const op=p.value; this.iRef.i++; const right=this.parseAdd(); return {type:'Binary',op,left,right}; } return left; }
  parseAdd(){ let node=this.parseMul(); while(true){ const p=peekToken(this.tokens,this.iRef); if(p.value==='+'||p.value==='-'){ this.iRef.i++; node={type:'Binary',op:p.value,left:node,right:this.parseMul()}; } else break; } return node; }
  parseMul(){ let node=this.parseUnary(); while(true){ const p=peekToken(this.tokens,this.iRef); if(p.value==='*'||p.value==='/'||(p.type==='KW'&&(p.value==='MOD'||p.value==='DIV'))){ const op=p.value; this.iRef.i++; node={type:'Binary',op,left:node,right:this.parseUnary()}; } else break; } return node; }
  parseUnary(){ const p=peekToken(this.tokens,this.iRef); if(p.value==='+'||p.value==='-'){ this.iRef.i++; return {type:'Unary',op:p.value,expr:this.parsePrimary()}; } return this.parsePrimary(); }

  parsePrimary(){
    const p=peekToken(this.tokens,this.iRef);
    if(p.type==='NUMBER'){ this.iRef.i++; return {type:'Number',value:parseFloat(p.value)}; }
    if(p.type==='STRING'){ this.iRef.i++; return {type:'String',value:p.value}; }
    if(p.type==='TIME'){ this.iRef.i++; const match=p.value.match(/([0-9.]+)(ms|s|m|h|d)?/i); let ms=parseFloat(match[1]); const unit=(match[2]||'s').toLowerCase(); if(unit==='s') ms*=1000; else if(unit==='m') ms*=60000; else if(unit==='h') ms*=3600000; else if(unit==='d') ms*=86400000; return {type:'Number',value:ms}; }
    if(p.type==='KW'&&(p.value==='TRUE'||p.value==='FALSE')){ this.iRef.i++; return {type:'Bool',value:p.value==='TRUE'}; }
    if(p.type==='IDENT'){
      const id=expectToken(this.tokens,this.iRef,'IDENT').value;
      let node={type:'Var',name:id};
      if(peekToken(this.tokens,this.iRef).value==='.') { expectToken(this.tokens,this.iRef,'.'); const member=expectToken(this.tokens,this.iRef,'IDENT').value; node={type:'MemberAccess',object:id,member}; }
      while(peekToken(this.tokens,this.iRef).value==='['){ expectToken(this.tokens,this.iRef,'['); const idx=this.parseExpression(); expectToken(this.tokens,this.iRef,']'); node={type:'ArrayRef',name:node.name,index:idx}; }
      if(peekToken(this.tokens,this.iRef).value==='('){ expectToken(this.tokens,this.iRef,'('); const args=[]; while(peekToken(this.tokens,this.iRef).value!==')'){ args.push(this.parseExpression()); if(peekToken(this.tokens,this.iRef).value===',') expectToken(this.tokens,this.iRef,','); } expectToken(this.tokens,this.iRef,')'); return {type:'CallExpr',name:id,args}; }
      return node;
    }
    if(p.value==='('){ expectToken(this.tokens,this.iRef,'('); const e=this.parseExpression(); expectToken(this.tokens,this.iRef,')'); return e; }
    throw new Error(`Unexpected primary token ${p.type}:${p.value}`);
  }
}

// Runtime class remains essentially unchanged, already dynamic and milliseconds-based

class Runtime {
  constructor(program){
    this.program=program; this.vars={}; this.fbInstances={}; this.logs=[]; this.cycleCount=0;
    this.initFromDeclarations(); this.stdlib=this.createStdLib();
  }
  initFromDeclarations(){ 
    for(const d of this.program.declarations) {
      // If init expression exists, evaluate it; otherwise use default
      let value = this.defaultForType(d.type);
      if(d.init) {
        try {
          value = this.evalExpression(d.init);
        } catch(e) {
          // If eval fails, use default
          value = this.defaultForType(d.type);
        }
      }
      this.vars[d.name]={type:d.type,value:value};
    }
  }
  defaultForType(type){ if(!type) return null; if(typeof type==='string'){ switch(type){ case'BOOL': return false; case'INT': return 0; case'REAL': return 0.0; case'STRING': return ''; default: return {_fbType:type,Q:false,ET:0}; } } else if(type.kind==='ARRAY'){ return Array.from({length:type.high-type.low+1},()=>this.defaultForType(type.base)); } return null; }

  createStdLib(){
    const that=this;
    return {
      TON:(n,p)=>{ if(!that.fbInstances[n]) that.fbInstances[n]={ET:0,Q:false,startTime:null}; const i=that.fbInstances[n]; const now=Date.now(); if(p.IN){ if(!i.startTime)i.startTime=now; i.ET=now-i.startTime; i.Q=i.ET>=p.PT; } else{i.startTime=null;i.ET=0;i.Q=false;} return {Q:i.Q,ET:i.ET}; },
      TOF:(n,p)=>{ if(!that.fbInstances[n]) that.fbInstances[n]={ET:0,Q:false,offStart:null}; const i=that.fbInstances[n]; const now=Date.now(); if(p.IN){ i.Q=true;i.ET=0; } else{ if(!i.offStart)i.offStart=now; i.ET=now-i.offStart;i.Q=i.ET<p.PT; if(!i.Q)i.offStart=null; } return {Q:i.Q,ET:i.ET}; },
      TP:(n,p)=>{ if(!that.fbInstances[n]) that.fbInstances[n]={Q:false,ET:0,active:false,start:0}; const i=that.fbInstances[n]; const now=Date.now(); if(p.IN && !i.active){ i.active=true;i.start=now;i.Q=true;i.ET=0; } if(i.active){ i.ET=now-i.start;if(i.ET>=p.PT){ i.active=false;i.Q=false; } } return {Q:i.Q,ET:i.ET}; },
      R_TRIG:(n,curr)=>{ if(!that.fbInstances[n]) that.fbInstances[n]={last:false}; const i=that.fbInstances[n]; const rising=!i.last&&!!curr; i.last=!!curr; return {Q:rising}; },
      F_TRIG:(n,curr)=>{ if(!that.fbInstances[n]) that.fbInstances[n]={last:false}; const i=that.fbInstances[n]; const falling=i.last&&!curr; i.last=!!curr; return {Q:falling}; },
      TO_BOOL:v=>!!v,TO_INT:v=>parseInt(v||0),TO_REAL:v=>parseFloat(v||0),NOW_MS:()=>Date.now()
    };
  }

  getVarValue(name){ if(!(name in this.vars)) throw new Error(`Unknown variable ${name}`); return this.vars[name].value; }
  setVarValue(name,val){ if(!(name in this.vars)) throw new Error(`Unknown variable ${name}`); const t=this.vars[name].type; if(typeof t==='string'){ if(t==='BOOL') val=!!val; else if(t==='INT') val=Math.trunc(Number(val)||0); else if(t==='REAL') val=Number(val)||0; else if(t==='STRING') val=String(val); } this.vars[name].value=val; }

  evalExpression(node){
    if(!node) return null;
    switch(node.type){
      case'Number': return node.value;
      case'String': return node.value;
      case'Bool': return node.value;
      case'Var': return this.getVarValue(node.name);
      case'MemberAccess': const obj=this.getVarValue(node.object); if(obj&&typeof obj==='object'&&node.member in obj)return obj[node.member]; throw new Error(`Member ${node.member} not found in ${node.object}`);
      case'ArrayRef': const arr=this.getVarValue(node.name); const idx=this.evalExpression(node.index); if(!Array.isArray(arr)) throw new Error(`${node.name} is not array`); return arr[idx];
      case'Unary': const v=this.evalExpression(node.expr); if(node.op==='-') return -v; if(node.op==='+') return +v; if(node.op==='NOT') return !v; return v;
      case'Binary': const a=this.evalExpression(node.left); const b=this.evalExpression(node.right); switch(node.op){ case'+': return a+b; case'-': return a-b; case'*': return a*b; case'/': return a/b; case'DIV': return Math.trunc(a/b); case'MOD': return a%b; case'AND': return a&&b; case'OR': return a||b; case'=': return a==b; case'<>': case'!=': return a!=b; case'<': return a<b; case'>': return a>b; case'<=': return a<=b; case'>=': return a>=b; default: throw new Error(`Unknown binary op ${node.op}`); }
      case'CallExpr': const args=node.args.map(a=>this.evalExpression(a)); const name=node.name.toUpperCase(); if(name in this.stdlib) return this.stdlib[name](...args); throw new Error(`Unknown function ${node.name}`);
      default: throw new Error(`Unsupported expression node ${node.type}`);
    }
  }

  execStatement(stmt){
    switch(stmt.type){
      case'Nop': return;
      case'Assign': const value=this.evalExpression(stmt.expr); if(stmt.left.type==='Var'){ this.setVarValue(stmt.left.name,value); return; } if(stmt.left.type==='ArrayRef'){ const arr=this.getVarValue(stmt.left.name); const idx=this.evalExpression(stmt.left.index); arr[idx]=value; return; } return;
      case'Call': const instanceName=stmt.name; if(instanceName in this.vars){ const fbInstance=this.vars[instanceName].value; if(fbInstance&&typeof fbInstance==='object'&&fbInstance._fbType){ const fbType=fbInstance._fbType.toUpperCase(); const args={}; for(const a of stmt.args){ if(a && a.name) args[a.name.toUpperCase()]=this.evalExpression(a.value); } if(['TON','TOF','TP'].includes(fbType)){ const res=this.stdlib[fbType](instanceName,{IN:!!args['IN'],PT:args['PT']||1000}); fbInstance.Q=res.Q; fbInstance.ET=res.ET; return res; } if(fbType==='R_TRIG'||fbType==='F_TRIG'){ const IN=args['CLK']||args['IN']; const res=this.stdlib[fbType](instanceName,!!IN); fbInstance.Q=res.Q; return res; } } } throw new Error(`Unknown function block or call: ${instanceName}`);
      case'If': if(this.evalExpression(stmt.cond)){ for(const s of stmt.thenStmts) this.execStatement(s); return; } let matched=false; for(const eb of stmt.elsifBlocks){ if(this.evalExpression(eb.cond)){ for(const s of eb.stmts) this.execStatement(s); matched=true; break; } } if(!matched){ for(const s of stmt.elseStmts) this.execStatement(s); } return;
      case'While': let guardCount=0; while(this.evalExpression(stmt.cond)){ for(const s of stmt.body) this.execStatement(s); guardCount++; if(guardCount>100000) throw new Error('Possible infinite WHILE loop'); } return;
      case'For': const start=this.evalExpression(stmt.start); const end=this.evalExpression(stmt.end); const step=stmt.step?this.evalExpression(stmt.step):1; this.setVarValue(stmt.varName,start); for(let i=start;i<=end;i+=step){ for(const s of stmt.body) this.execStatement(s); this.setVarValue(stmt.varName,i+step); } return;
      default: throw new Error(`Unsupported statement type ${stmt.type}`);
    }
  }

  runCycle(){ this.cycleCount++; for(const st of this.program.statements) this.execStatement(st); }
  reset(){ this.vars={}; this.fbInstances={}; this.initFromDeclarations(); this.cycleCount=0; }
  getVarsPlain(){ const out={}; for(const [k,v] of Object.entries(this.vars)) out[k]=v.value; return out; }
}

// Public compile
function compile(stCode){
  const tokenizer=new Tokenizer(stCode);
  const tokens=tokenizer.tokenize();
  const parser=new Parser(tokens);
  const program=parser.parseProgram();
  const runtime=new Runtime(program);
  return {
    program,
    runtime,
    init:(vars)=>{ if(vars){ for(const k of Object.keys(vars)) if(runtime.vars[k]) runtime.setVarValue(k,vars[k]); } },
    step:()=>runtime.runCycle(),
    runCycles:(n=1)=>{ for(let i=0;i<n;i++) runtime.runCycle(); },
    getVars:()=>runtime.getVarsPlain(),
    reset:()=>runtime.reset(),
    logs:()=>runtime.logs
  };
}

module.exports={compile};
