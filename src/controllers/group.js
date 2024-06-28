import pool from "../../db.js";
import {
  createGroupCommentQuery,
  createGroupLikeQuery,
  createGroupPostQuery,
  createGroupQuery,
  deleteGroupLikeQuery,
  deleteGroupPostQuery,
  deleteGroupQuery,
  getGroupCommentsQuery,
  getGroupLikesQuery,
  getGroupMembersQuery,
  getGroupPostsQuery,
  getJoinedGroupsQuery,
  getSavedGroupPostIdsQuery,
  getSavedGroupPostsQuery,
  getUnjoinedGroupsQuery,
  joinGroupQuery,
  leaveGroupQuery,
  saveGroupPostQuery,
  unsaveGroupPostQuery,
} from "../queries.js";

export async function createGroup(req, res) {
  const { name, description, image } = req.body;
  const { id } = req.userInfo;

  try {
    const result = await pool.query(createGroupQuery, [
      name,
      description,
      image,
      id,
    ]);
    await pool.query(joinGroupQuery, [result.rows[0].groupId, id]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
}

export async function deleteGroup(req, res) {
  const { id } = req.userInfo;
  const { groupId } = req.params;

  try {
    await pool.query(deleteGroupQuery, [groupId, id]);
    res.status(204).send();
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
}

export async function getJoinedGroups(req, res) {
  const { id } = req.userInfo;

  try {
    const result = await pool.query(getJoinedGroupsQuery, [id]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
}

export async function getUnjoinedGroups(req, res) {
  const { id } = req.userInfo;

  try {
    const result = await pool.query(getUnjoinedGroupsQuery, [id]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
}

export async function joinGroup(req, res) {
  const { id } = req.userInfo;
  const { groupId } = req.params;

  try {
    await pool.query(joinGroupQuery, [groupId, id]);
    res.status(204).send();
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
}

export async function leaveGroup(req, res) {
  const { id } = req.userInfo;
  const { groupId } = req.params;

  try {
    await pool.query(leaveGroupQuery, [groupId, id]);
    res.status(204).send();
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
}

export async function getGroupMembers(req, res) {
  const { groupId } = req.params;

  try {
    const result = await pool.query(getGroupMembersQuery, [groupId]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
}

export async function createGroupPost(req, res) {
  const { description, image } = req.body;
  const { id } = req.userInfo;
  const { groupId } = req.params;

  try {
    const result = await pool.query(createGroupPostQuery, [
      description,
      image,
      id,
      groupId,
    ]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
}

export async function getGroupPosts(req, res) {
  const { groupId } = req.params;

  try {
    const result = await pool.query(getGroupPostsQuery, [groupId]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
}

export async function deleteGroupPost(req, res) {
  const { postId } = req.params;

  try {
    await pool.query(deleteGroupPostQuery, [postId]);
    res.status(204).send();
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
}

export async function getGroupComments(req, res) {
  const { postId } = req.params;

  try {
    const result = await pool.query(getGroupCommentsQuery, [postId]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
}

export async function createGroupComment(req, res) {
  const { postId } = req.params;
  const { description } = req.body;
  const { id } = req.userInfo;

  try {
    const result = await pool.query(createGroupCommentQuery, [
      description,
      id,
      postId,
    ]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
}

export async function getGroupPostLikes(req, res) {
  const { postId } = req.params;

  try {
    const result = await pool.query(getGroupLikesQuery, [postId]);
    res.status(200).json(result.rows.map((like) => like.userId));
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
}

export async function createGroupPostLike(req, res) {
  const { postId } = req.params;
  const { id } = req.userInfo;

  try {
    const result = await pool.query(createGroupLikeQuery, [postId, id]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
}

export async function deleteGroupPostLike(req, res) {
  const { postId } = req.params;
  const { id } = req.userInfo;

  try {
    await pool.query(deleteGroupLikeQuery, [postId, id]);
    res.status(204).send();
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
}

export async function saveGroupPost(req, res) {
  const { postId } = req.params;
  const { id } = req.userInfo;

  try {
    await pool.query(saveGroupPostQuery, [postId, id]);
    res.status(204).send();
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
}

export async function getGroupSavedPosts(req, res) {
  const { id } = req.userInfo;

  try {
    const result = await pool.query(getSavedGroupPostsQuery, [id]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
}

export async function unsaveGroupPost(req, res) {
  const { postId } = req.params;
  const { id } = req.userInfo;

  try {
    await pool.query(unsaveGroupPostQuery, [postId, id]);
    res.status(204).send();
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
}

export async function getGroupSavedPostIds(req, res) {
  const { id } = req.userInfo;

  try {
    const result = await pool.query(getSavedGroupPostIdsQuery, [id]);
    res.status(200).json(result.rows.map((post) => post.groupPostId));
  } catch (error) {
    console.log(error);
    res.status(500).send("Server error");
  }
}
