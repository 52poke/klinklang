import Router from 'koa-router';
import send from 'koa-send';
import sass from 'node-sass';
import {promisify} from 'util';

const router = new Router();

router.post('/api/scss', async function (ctx, next) {
  if (!ctx.req.isXHub || !ctx.req.isXHubValid()) {
    ctx.throw(403, 'Invalid X-Hub Request.');
  }
  const { css, map } = await promisify(sass.render.bind(sass))({
    data: ctx.request.body.text || '',
    outputStyle: 'compressed'
  });
  ctx.body = { text: css.toString().split('}').join('}\n') };
});

export default router;