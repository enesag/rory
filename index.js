const prompts = require('prompts');
const path = require('path');
const fs = require('fs');
const cp = require('child_process');

const DEFAULTS_PATH = path.join(__dirname, 'defaults.json');
const PATCHES_PATH = path.join(__dirname, 'patches');

const FS_ERROR_CALLBACK = (err) => err && console.error({ err });

const defaults = JSON.parse(fs.readFileSync(DEFAULTS_PATH, 'utf8'));

const GIT_BRANCH = 'git branch';
const GIT_LOG = 'git log --pretty=format:"%h %ad > %s%d [%an]" --date=short';
const GIT_FORMAT_PATCH = `git format-patch -o ${PATCHES_PATH} --root`;
const GIT_CHECKOUT = 'git checkout';
const GIT_APPLY = 'git am --3way';

const QUESTION_NAMES = {
  REPOS: 'repos',
  FROM_REPO: 'fromRepo',
  FROM_BRANCH: 'fromBranch',
  TO_REPO: 'toRepo',
  TO_BRANCH: 'toBranch',
  SINCE_COMMIT: 'since',
};

const saveDefaults = (response) => {
  fs.writeFileSync(DEFAULTS_PATH, JSON.stringify(response, null, 2));
}

const getDynamicQuestionFields = (questionName) => ({
  name: questionName,
  // initial: defaults[questionName]
});

const getBranchList = (selectedRepo) => cp.execSync(GIT_BRANCH, { cwd: selectedRepo }).toString('utf-8').split(/[\n\r]/)
  .filter(branch => branch.length)
  .map((branch) => branch.substring(2))
  .map((branch) => ({ title: branch, value: branch }));

const getCommits = (fromRepo, fromBranch) =>
  cp.execSync(`${GIT_LOG} ${fromBranch}`, { cwd: fromRepo })
    .toString('utf-8').split(/[\n\r]/)
    .filter(commit => commit.length)
    .map((commit) => ({ title: commit, value: commit.substring(0, 7) }))

const questions = [
  {
    type: 'text',
    message: 'Commit kopyalama islemini yapmak istediginiz repolarin bulundugu klasor:',
    ...getDynamicQuestionFields(QUESTION_NAMES.REPOS),
    initial: defaults.reposRoot,
    format: reposRoot => {
      saveDefaults({ reposRoot });
      return fs.readdirSync(reposRoot)
        .map((repoDir) => ({ title: repoDir, value: path.join(reposRoot, repoDir) }))
    }
  },
  {
    type: 'select',
    message: 'From Repo:',
    choices: (_, { [QUESTION_NAMES.REPOS]: repos }) => repos,
    ...getDynamicQuestionFields(QUESTION_NAMES.FROM_REPO)
  },
  {
    type: 'select',
    message: 'From Branch:',
    choices: getBranchList,
    ...getDynamicQuestionFields(QUESTION_NAMES.FROM_BRANCH)
  },
  {
    type: 'select',
    message: 'To Repo:',
    choices: (_, { [QUESTION_NAMES.REPOS]: repos }) => repos,
    ...getDynamicQuestionFields(QUESTION_NAMES.TO_REPO)
  },
  {
    type: 'select',
    message: 'To Branch:',
    choices: getBranchList,
    ...getDynamicQuestionFields(QUESTION_NAMES.TO_BRANCH)
  },
  {
    type: 'select',
    message: 'Since Commit:',
    choices: (_, { [QUESTION_NAMES.FROM_REPO]: fromRepo, [QUESTION_NAMES.FROM_BRANCH]: fromBranch }) =>
      getCommits(fromRepo, fromBranch),
    ...getDynamicQuestionFields(QUESTION_NAMES.SINCE_COMMIT),
  },
];


fs.rmdirSync(PATCHES_PATH, { recursive: true, force: true });
fs.mkdirSync(PATCHES_PATH);

(async () => {
  const { [QUESTION_NAMES.REPOS]: repos, ...otherAnswers } =
    await prompts(questions, { onCancel: () => { throw Error() } });

  const {
    [QUESTION_NAMES.FROM_REPO]: fromRepo,
    [QUESTION_NAMES.FROM_BRANCH]: fromBranch,
    [QUESTION_NAMES.TO_REPO]: toRepo,
    [QUESTION_NAMES.TO_BRANCH]: toBranch,
    [QUESTION_NAMES.SINCE_COMMIT]: sinceCommit,
  } = otherAnswers;

  const commits = getCommits(fromRepo, fromBranch);
  const selectedCommitIndex = commits.findIndex(({ value }) => sinceCommit === value);

  // create patches
  if (selectedCommitIndex === commits.length - 1) {
    cp.execSync(`${GIT_FORMAT_PATCH} ${fromBranch}`, { cwd: fromRepo })
  } else {
    const since = commits[selectedCommitIndex + 1].value;
    cp.execSync(`${GIT_FORMAT_PATCH} ${since}..${fromBranch}`, { cwd: fromRepo })
  }

  // apply patches
  cp.execSync(`${GIT_CHECKOUT} ${toBranch}`, { cwd: toRepo });
  fs.readdirSync(PATCHES_PATH).sort().forEach((patch) =>
    cp.execSync(`${GIT_APPLY} ${path.posix.join(...PATCHES_PATH.split(path.sep), `${patch}`)}`, { cwd: toRepo }));
  cp.execSync(`${GIT_CHECKOUT} -`, { cwd: toRepo });

  // saveDefaults({ repos });

})();
