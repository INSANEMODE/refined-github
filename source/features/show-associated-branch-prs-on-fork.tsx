import React from 'dom-chef';
import {CachedFunction} from 'webext-storage-cache';
import * as pageDetect from 'github-url-detection';
import GitMergeIcon from '@primer/octicons/build/svg/git-merge-16.svg';
import GitPullRequestIcon from '@primer/octicons/build/svg/git-pull-request-16.svg';
import GitPullRequestClosedIcon from '@primer/octicons/build/svg/git-pull-request-closed-16.svg';
import GitPullRequestDraftIcon from '@primer/octicons/build/svg/git-pull-request-draft-16.svg';

import observe from '../helpers/selector-observer.js';
import features from '../feature-manager.js';
import api from '../github-helpers/api.js';
import {cacheByRepo, upperCaseFirst} from '../github-helpers/index.js';
import AssociatedPullRequests from './show-associated-branch-prs-on-fork.gql';

type PullRequest = {
	timelineItems: {
		nodes: AnyObject;
	};
	number: number;
	state: keyof typeof stateIcon;
	isDraft: boolean;
	url: string;
};

export const pullRequestsAssociatedWithBranch = new CachedFunction('associatedBranchPullRequests', {
	async updater(): Promise<Record<string, PullRequest>> {
		const {repository} = await api.v4(AssociatedPullRequests);

		const pullRequests: Record<string, PullRequest> = {};
		for (const {name, associatedPullRequests} of repository.refs.nodes) {
			const [prInfo] = associatedPullRequests.nodes as PullRequest[];
			// Check if the ref was deleted, since the result includes pr's that are not in fact related to this branch but rather to the branch name.
			const headRefWasDeleted = prInfo?.timelineItems.nodes[0]?.__typename === 'HeadRefDeletedEvent';
			if (prInfo && !headRefWasDeleted) {
				prInfo.state = prInfo.isDraft && prInfo.state === 'OPEN' ? 'DRAFT' : prInfo.state;
				pullRequests[name] = prInfo;
			}
		}

		return pullRequests;
	},
	maxAge: {hours: 1},
	staleWhileRevalidate: {days: 4},
	cacheKey: cacheByRepo,
});

export const stateIcon = {
	OPEN: GitPullRequestIcon,
	CLOSED: GitPullRequestClosedIcon,
	MERGED: GitMergeIcon,
	DRAFT: GitPullRequestDraftIcon,
};

function addAssociatedPRLabel(branchCompareLink: Element, prInfo: PullRequest): void {
	const StateIcon = stateIcon[prInfo.state];
	const state = upperCaseFirst(prInfo.state);

	branchCompareLink.replaceWith(
		<div className="d-inline-block text-right ml-3">
			<a
				data-issue-and-pr-hovercards-enabled
				href={prInfo.url}
				data-hovercard-type="pull_request"
				data-hovercard-url={prInfo.url + '/hovercard'}
			>
				#{prInfo.number}
			</a>
			{' '}
			<span
				className={`State State--${prInfo.state.toLowerCase()} State--small ml-1`}
			>
				<StateIcon width={14} height={14}/> {state}
			</span>
		</div>,
	);
}

async function addLink(branchCompareLink: Element): Promise<void> {
	const prs = await pullRequestsAssociatedWithBranch.get();
	const branchName = branchCompareLink.closest('[branch]')!.getAttribute('branch')!;
	const prInfo = prs[branchName];
	if (prInfo) {
		addAssociatedPRLabel(branchCompareLink, prInfo);
	}
}

function init(signal: AbortSignal): void {
	observe('.test-compare-link', addLink, {signal});
}

void features.add(import.meta.url, {
	asLongAs: [
		pageDetect.isForkedRepo,
	],
	include: [
		pageDetect.isBranches,
	],
	init,
});

/*

Test URLs:

https://github.com/pnarielwala/create-react-app-ts/branches

*/
