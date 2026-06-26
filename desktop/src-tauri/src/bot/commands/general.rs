use super::Ctx;
use crate::commands::cmd_registry::{increment_counter, BotCommand};
use crate::scripting::context::{read_shell_enabled, ScriptCtx};
use crate::scripting::execute::run_script;

pub async fn custom(ctx: &Ctx<'_>, command: &BotCommand) -> Vec<String> {
    let Some(ref src) = command.script else {
        return plain_response(command, ctx).await;
    };

    let count = get_count(command, ctx).await;
    let args  = ctx.args.split_whitespace().map(str::to_string).collect();

    let shell_enabled = {
        let pool = ctx.queue.db.read().await;
        read_shell_enabled(&pool).await
    };

    let script_ctx = ScriptCtx {
        msg:             ctx.msg,
        args,
        queue:           ctx.queue.clone(),
        command_name:    command.description.clone(),
        command_trigger: command.trigger.clone(),
        command_counter: count,
        sub_mode:        ctx.sub_mode,
        viewer_limit:    ctx.viewer_limit,
        sub_limit:       ctx.subscriber_limit,
        queue_size:      ctx.queue_size,
        platform:        ctx.msg.platform.clone(),
        shell_enabled,
    };

    run_script(src, &script_ctx, ctx.app_handle.clone()).await
}

async fn plain_response(command: &BotCommand, ctx: &Ctx<'_>) -> Vec<String> {
    let Some(ref template) = command.response else { return vec![]; };
    let count = get_count(command, ctx).await;
    vec![template
        .replace("{username}",   &ctx.msg.username)
        .replace("{args}",       ctx.args)
        .replace("{count}",      &count.to_string())
        .replace("{platform}",   &ctx.msg.platform)
        .replace("{queue_size}", &ctx.queue_size.to_string())]
}

async fn get_count(command: &BotCommand, ctx: &Ctx<'_>) -> i64 {
    let pool = ctx.queue.db.read().await;
    increment_counter(&*pool, command.id).await
}
