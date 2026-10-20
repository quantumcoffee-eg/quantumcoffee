import globals from 'globals';
export default [{files:['src/**/*.{js,jsx}','vite.config.js'],languageOptions:{ecmaVersion:'latest',sourceType:'module',globals:{...globals.browser,...globals.node},parserOptions:{ecmaFeatures:{jsx:true}}},rules:{'no-undef':'error','no-unused-vars':['warn',{argsIgnorePattern:'^_'}]}}];
