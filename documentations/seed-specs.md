** Human drafted, do not edit or delete **
# Focus editor

- I want the a simple text editor that works with markdown
- Very similar to how Notion or Microsoft Loop does text editing
    - Standard text formattijng fucntionalities
    - table editing capabilities
    - Special components can be added later. We will keep this for future and make it scalable.
        - Simple components like image, gallery etc might be added in future

## Main UI and the UX
- The main UI that makes this app unique is that the entire UI is blank except ofr a red 10px circle enclosed by a frosted circle of 30px radius at the top center of the UI. This serves as the trigger for opening a minimal toolbar
- Another main USP is the concept of focus mode. Only the row where the text-cursor/caret-position is is highlighted and the rest are subdued. Refer this for the exact implementation for this feature "https://github.com/prabinpebam/markdown-focus-editor.git" Use this repo only for that feature as we are trying to start over clean and not carry over the old concepts from here except for this one.
- Main workflows
    - CRUD files and folders, including moves
    - Text editing
    - Sharing o public links

# Theming and scalability
- I want the ability to change theme
    - Colors, fonts

## Packaging and distribution
- The whole thing will be managed as a github repo
- The app itself will be hosted in githiub pages.
- This can be access through web or an electron app
- The content can be made public or private
- Private content are hosted in a private repo which is a submodule of the parent repo
    - Refer this project to see how it's done "E:\Projects\Personal\personal-site"

## Slate
- Use slate for documentation
    - https://github.com/prabinpebam/slate.git