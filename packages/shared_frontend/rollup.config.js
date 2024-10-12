import resolve from '@rollup/plugin-node-resolve';
import babel from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import postcss from 'rollup-plugin-postcss';

const isProduction = process.env.NODE_ENV === 'production';

export default {
    input: 'src/index.ts',
    output: [
        {
            file: isProduction ? 'dist/index.esm.min.js' : 'dist/index.esm.js',
            format: 'esm',
            sourcemap: !isProduction,
        }
    ],
    plugins: [
        postcss({
            modules: {
                auto: /\.module\.css$/,
                generateScopedName: isProduction
                    ? '[hash:base64:5]'
                    : '[name]__[local]___[hash:base64:5]',
            },
            extract: false,
            minimize: isProduction
        }),
        resolve(),
        commonjs(),
        babel({
            babelHelpers: 'bundled',
            exclude: 'node_modules/**'
        }),
        typescript({
            tsconfig: './tsconfig.json',
            sourceMap: !isProduction,
        }),
        isProduction && terser(),
    ].filter(Boolean),
    external: ['react', 'react-dom'],
};
