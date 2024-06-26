import {
  createGroupQuery,
  getJoinedGroupsQuery,
  getUnjoinedGroupsQuery,
  joinGroupQuery,
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
