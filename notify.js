const { Octokit } = require('@octokit/core');
const fs = require('fs');

// 检查 GITHUB_TOKEN
if (!process.env.GITHUB_TOKEN) {
    console.error('GITHUB_TOKEN 环境变量未设置');
    process.exit(1);
}

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
});

async function notifyAuthors() {
    const { GITHUB_EVENT_PATH } = process.env;
    const event = JSON.parse(fs.readFileSync(GITHUB_EVENT_PATH, 'utf8'));

    const discussion = event.discussion;
    const comment = event.comment;

    // 检查必要的数据是否存在
    if (!discussion) {
        console.log('未找到 discussion 数据');
        return;
    }

    if (!comment) {
        console.log('未找到 comment 数据');
        return;
    }

    if (!comment.user) {
        console.log('未找到 comment.user 数据');
        return;
    }

    // 跳过机器人评论
    if (comment.user.type === 'Bot') {
        console.log('跳过机器人评论');
        return;
    }

    // 跳过通知区本身的评论
    if (discussion.id == 2) {
        return;
    }

    // 直接使用讨论标题作为脚本路径
    const scriptPath = discussion.title;
    if (!scriptPath) {
        console.log('未找到讨论标题');
        return;
    }

    // 读取作者映射
    let authorMapping;
    try {
        authorMapping = JSON.parse(fs.readFileSync('author_mapping.json', 'utf8'));
    } catch (error) {
        console.log('读取 author_mapping.json 失败:', error.message);
        return;
    }

    const scriptInfo = authorMapping.find(item => item.path === scriptPath);

    if (!scriptInfo || !scriptInfo.authorLinks.length) {
        console.log(`未找到脚本 ${scriptPath} 的作者信息`);
        return;
    }

    // 构建 @mention 字符串
    const mentions = scriptInfo.authorLinks.map(link => {
        const username = link.split('/').pop();
        return `@${username}`;
    }).join(' ');

    // 构建通知评论
    const notificationComment = `🔔 **脚本评论通知**\n\n${mentions}\n\n📁 **脚本路径：** \n\`${scriptPath}\`\n💬 **评论内容：**\n${comment.body}\n\n🔗 **评论区链接：** [#${discussion.number}](${discussion.html_url})`;

    // 发送通知
    try {
        console.log('准备发送通知到讨论区 #21');
        console.log('通知内容:', notificationComment);
        
        // 使用 GraphQL API 创建讨论评论
        const mutation = `
            mutation AddDiscussionComment($input: AddDiscussionCommentInput!) {
                addDiscussionComment(input: $input) {
                    comment {
                        id
                        url
                    }
                }
            }
        `;

        // 获取讨论区 #2 的 node_id
        const discussionQuery = `
            query GetDiscussion($owner: String!, $repo: String!, $number: Int!) {
                repository(owner: $owner, name: $repo) {
                    discussion(number: $number) {
                        id
                    }
                }
            }
        `;

        const discussionResponse = await octokit.graphql(discussionQuery, {
            owner: 'babalae',
            repo: 'bettergi-script-web-giscus',
            number: 21
        });

        if (!discussionResponse.repository?.discussion?.id) {
            throw new Error('未找到讨论区 #21');
        }

        const discussionId = discussionResponse.repository.discussion.id;
        console.log('讨论区 #21 的 ID:', discussionId);

        const variables = {
            input: {
                discussionId: discussionId,
                body: notificationComment,
            },
        };

        const response = await octokit.graphql(mutation, variables);
        console.log('评论创建成功:', response.addDiscussionComment.comment.url);
        console.log(`已通知作者: ${scriptInfo.authorLinks.join(', ')}`);
    } catch (error) {
        console.log('发送通知失败:', error.message);
        if (error.errors) {
            console.log('GraphQL错误:', error.errors);
        }
    }
}


notifyAuthors().catch(error => {
    console.error('脚本执行失败:', error);
    process.exit(1);
});